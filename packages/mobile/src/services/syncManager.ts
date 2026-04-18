import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import {
  Note,
  Category,
  NoteStatus,
  CreateNoteDto,
  UpdateNoteDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  ApiClient,
  HttpError,
} from '@flashpad/shared';
import {
  getLocalNotes,
  getLocalNote,
  saveLocalNote,
  deleteLocalNote,
  bulkSaveNotes,
  getLocalCategories,
  saveLocalCategory,
  deleteLocalCategory,
  bulkSaveCategories,
  addToSyncQueue,
  getSyncQueue,
  removeSyncQueueItem,
  updateSyncQueueItemError,
  getSyncQueueCount,
  clearLocalData,
  clearSyncQueue,
  remapLocalCategoryReferences,
  SyncOperation,
  getInboxCount as getLocalInboxCount,
  getCategoryCounts,
} from './database';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface QueuedCreateNotePayload extends CreateNoteDto {
  status?: NoteStatus;
}

export interface SyncManagerOptions {
  api: ApiClient;
  deviceId?: string;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onPendingCountChange?: (count: number) => void;
  onDataRefresh?: () => void;
  onConflict?: (noteId: string, serverVersion: number) => void;
}

export class SyncManager {
  private api: ApiClient;
  private isOnline: boolean = true;
  private syncStatus: SyncStatus = 'idle';
  private syncInProgress: boolean = false;
  private deviceId = '';
  private onSyncStatusChange?: (status: SyncStatus) => void;
  private onPendingCountChange?: (count: number) => void;
  private onDataRefresh?: () => void;
  private onConflict?: (noteId: string, serverVersion: number) => void;
  private netInfoUnsubscribe?: () => void;
  private appStateSubscription?: { remove: () => void };

  constructor(options: SyncManagerOptions) {
    this.api = options.api;
    this.deviceId = options.deviceId ?? '';
    this.onSyncStatusChange = options.onSyncStatusChange;
    this.onPendingCountChange = options.onPendingCountChange;
    this.onDataRefresh = options.onDataRefresh;
    this.onConflict = options.onConflict;

    this.setupNetworkListener();
    this.setupAppStateListener();
  }

  private setupNetworkListener(): void {
    // Check initial network state
    NetInfo.fetch().then((state: NetInfoState) => {
      this.isOnline = state.isConnected ?? false;
      this.updateSyncStatus(this.isOnline ? 'idle' : 'offline');
    });

    // Listen for network changes
    this.netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (!wasOnline && this.isOnline) {
        // Just came online, process sync queue
        this.updateSyncStatus('idle');
        this.processSyncQueue();
      } else if (!this.isOnline) {
        this.updateSyncStatus('offline');
      }
    });
  }

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && this.isOnline) {
        // App came to foreground, sync if online
        this.processSyncQueue();
      }
    });
  }

  destroy(): void {
    this.netInfoUnsubscribe?.();
    this.appStateSubscription?.remove();
  }

  private updateSyncStatus(status: SyncStatus): void {
    this.syncStatus = status;
    this.onSyncStatusChange?.(status);
  }

  private async updatePendingCount(): Promise<void> {
    const count = await getSyncQueueCount();
    this.onPendingCountChange?.(count);
  }

  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  private getDeviceId(preferredDeviceId?: string): string | undefined {
    return preferredDeviceId || this.deviceId || undefined;
  }

  private isConflictError(error: unknown): boolean {
    return (error instanceof HttpError && error.status === 409)
      || (typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 409);
  }

  // Initial data sync - fetch from server and populate local storage
  async initialSync(): Promise<void> {
    if (!this.isOnline) {
      console.log('Offline - skipping initial sync');
      return;
    }

    try {
      this.updateSyncStatus('syncing');

      const [notesResponse, categories] = await Promise.all([
        this.api.getNotes({ pageSize: 1000 }),
        this.api.getCategories(),
      ]);

      await bulkSaveNotes(notesResponse.notes);
      await bulkSaveCategories(categories);

      this.updateSyncStatus('idle');
      console.log('Initial sync complete');
    } catch (error) {
      console.error('Initial sync failed:', error);
      this.updateSyncStatus('error');
    }
  }

  // Process pending sync queue
  async processSyncQueue(): Promise<void> {
    if (!this.isOnline || this.syncInProgress) return;

    this.syncInProgress = true;
    this.updateSyncStatus('syncing');

    try {
      let queue = await getSyncQueue();
      let hasRetryRequiredItems = false;

      while (queue.length > 0) {
        let queueInvalidated = false;
        let queueBlocked = false;

        for (const item of queue) {
        try {
          let payload = {};
          let payloadValid = true;
          try {
            payload = item.payload ? JSON.parse(item.payload) : {};
          } catch (parseError) {
            console.warn(`Invalid payload for sync item ${item.id}`);
            payloadValid = false;
          }

          // For Create/Update operations, we need valid payload data - skip if invalid
          if (!payloadValid && (item.operation === SyncOperation.Create || item.operation === SyncOperation.Update)) {
            console.warn(`Removing sync item ${item.id} - invalid payload for ${item.operation} operation`);
            await removeSyncQueueItem(item.id);
            await this.updatePendingCount();
            continue;
          }

          switch (item.operation) {
            case SyncOperation.Create:
              if (item.entityType === 'note') {
                const notePayload = payload as QueuedCreateNotePayload;
                const localNote = item.entityId.startsWith('local_')
                  ? await getLocalNote(item.entityId)
                  : null;
                if (item.entityId.startsWith('local_') && !localNote) {
                  break;
                }
                const createRequest: CreateNoteDto = {
                  content: localNote?.content ?? notePayload.content,
                  categoryId: localNote?.categoryId ?? notePayload.categoryId,
                  deviceId: localNote?.deviceId ?? notePayload.deviceId,
                };
                const newNote = await this.api.createNote(createRequest);
                let syncedNote = newNote;
                const finalStatus = localNote?.status ?? notePayload.status ?? NoteStatus.Inbox;
                const finalDeviceId = localNote?.deviceId ?? notePayload.deviceId;

                if (finalStatus === NoteStatus.Archived) {
                  syncedNote = await this.api.archiveNote(newNote.id, finalDeviceId);
                } else if (finalStatus === NoteStatus.Trash) {
                  await this.api.trashNote(newNote.id, finalDeviceId);
                  syncedNote = {
                    ...newNote,
                    status: NoteStatus.Trash,
                    updatedAt: new Date().toISOString(),
                  };
                }

                if (localNote) {
                  await deleteLocalNote(item.entityId);
                }
                await saveLocalNote(syncedNote, false);
              } else if (item.entityType === 'category') {
                const localCategory = item.entityId.startsWith('local_')
                  ? (await getLocalCategories()).find((category) => category.id === item.entityId) ?? null
                  : null;
                if (item.entityId.startsWith('local_') && !localCategory) {
                  break;
                }
                const categoryPayload = payload as CreateCategoryDto;
                const newCategory = await this.api.createCategory({
                  name: localCategory?.name ?? categoryPayload.name,
                  color: localCategory?.color ?? categoryPayload.color,
                  icon: localCategory?.icon ?? categoryPayload.icon,
                });
                if (localCategory) {
                  await deleteLocalCategory(item.entityId);
                }
                await saveLocalCategory(newCategory, false);
                await remapLocalCategoryReferences(item.entityId, newCategory.id);
                queueInvalidated = true;
              }
              break;

            case SyncOperation.Update:
              if (item.entityType === 'note') {
                const updatePayload = payload as UpdateNoteDto;
                const updatedNote = await this.api.updateNote(item.entityId, {
                  ...updatePayload,
                  deviceId: this.getDeviceId(updatePayload.deviceId),
                  baseVersion: item.baseVersion ?? updatePayload.baseVersion,
                });
                await saveLocalNote(updatedNote, false);
              } else if (item.entityType === 'category') {
                const updatedCategory = await this.api.updateCategory(item.entityId, payload as UpdateCategoryDto);
                await saveLocalCategory(updatedCategory, false);
              }
              break;

            case SyncOperation.Delete:
              if (item.entityType === 'note') {
                await this.api.deleteNotePermanently(item.entityId);
                await deleteLocalNote(item.entityId);
              } else if (item.entityType === 'category') {
                await this.api.deleteCategory(item.entityId);
                await deleteLocalCategory(item.entityId);
              }
              break;

            case SyncOperation.Archive:
              await this.api.archiveNote(item.entityId);
              break;

            case SyncOperation.Restore:
              await this.api.restoreNote(item.entityId);
              break;

            case SyncOperation.Trash:
              await this.api.trashNote(item.entityId);
              break;

            case SyncOperation.Move:
              await this.api.moveNote(item.entityId, payload);
              break;
          }

          await removeSyncQueueItem(item.id);
          await this.updatePendingCount();
        } catch (error) {
          const errorMessage = (error as Error).message;
          console.error(`Failed to sync item ${item.id}:`, error);

          if (item.operation === SyncOperation.Update && item.entityType === 'note' && this.isConflictError(error)) {
            try {
              const latestNote = await this.api.getNote(item.entityId);
              await saveLocalNote(latestNote, false);
              await removeSyncQueueItem(item.id);
              await this.updatePendingCount();
              this.onConflict?.(item.entityId, latestNote.version);
              continue;
            } catch (refreshError) {
              console.error(`Failed to refresh conflicted note ${item.entityId}:`, refreshError);
            }
          }

          // Immediately remove items that reference non-existent resources
          if (errorMessage.includes('not found') || errorMessage.includes('Not found')) {
            console.warn(`Removing sync item ${item.id} - resource no longer exists`);
            await removeSyncQueueItem(item.id);
            await this.updatePendingCount();
            continue;
          }

          await updateSyncQueueItemError(item.id, errorMessage);

          if (item.retryCount + 1 >= 3) {
            hasRetryRequiredItems = true;
            console.warn(`Sync item ${item.id} requires manual retry`);
          }
          queueBlocked = true;
        }

        if (queueInvalidated || queueBlocked) {
          break;
        }
      }

        if (queueBlocked) {
          break;
        }

        queue = await getSyncQueue();
      }

      this.updateSyncStatus(hasRetryRequiredItems ? 'error' : 'idle');
      this.onDataRefresh?.();
    } catch (error) {
      console.error('Sync queue processing failed:', error);
      this.updateSyncStatus('error');
    } finally {
      this.syncInProgress = false;
    }
  }

  // Note operations with offline support
  async getNotes(params: { status?: NoteStatus; categoryId?: string }): Promise<Note[]> {
    const localNotes = await getLocalNotes(params);

    if (this.isOnline) {
      this.api.getNotes({ ...params, pageSize: 1000 })
        .then(async (response) => {
          await bulkSaveNotes(response.notes);
        })
        .catch(console.error);
    }

    return localNotes;
  }

  async createNote(data: CreateNoteDto): Promise<Note> {
    const now = new Date().toISOString();
    const tempId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const createData: CreateNoteDto = {
      ...data,
      deviceId: this.getDeviceId(data.deviceId),
    };

    const localNote: Note = {
      id: tempId,
      content: createData.content,
      categoryId: createData.categoryId,
      status: NoteStatus.Inbox,
      version: 1,
      deviceId: createData.deviceId,
      createdAt: now,
      updatedAt: now,
    };

    await saveLocalNote(localNote, true);

    if (this.isOnline) {
      try {
        const serverNote = await this.api.createNote(createData);
        await deleteLocalNote(tempId);
        await saveLocalNote(serverNote, false);
        return serverNote;
      } catch (error) {
        console.error('Failed to create note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: tempId,
          operation: SyncOperation.Create,
          payload: JSON.stringify(createData),
          baseVersion: null,
        });
        await this.updatePendingCount();
        return localNote;
      }
    } else {
      await addToSyncQueue({
        entityType: 'note',
        entityId: tempId,
        operation: SyncOperation.Create,
        payload: JSON.stringify(createData),
        baseVersion: null,
      });
      await this.updatePendingCount();
      return localNote;
    }
  }

  async updateNote(id: string, data: UpdateNoteDto): Promise<Note> {
    const existingNote = await getLocalNote(id);
    if (!existingNote) {
      throw new Error('Note not found');
    }

    const updateData: UpdateNoteDto = {
      ...data,
      deviceId: this.getDeviceId(data.deviceId ?? existingNote.deviceId),
    };

    const updatedNote: Note = {
      ...existingNote,
      content: updateData.content,
      categoryId: updateData.categoryId,
      deviceId: updateData.deviceId,
      version: existingNote.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await saveLocalNote(updatedNote, id.startsWith('local_'));

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        const serverNote = await this.api.updateNote(id, {
          ...updateData,
          baseVersion: existingNote.version,
        });
        await saveLocalNote(serverNote, false);
        return serverNote;
      } catch (error) {
        if (this.isConflictError(error)) {
          try {
            const latestNote = await this.api.getNote(id);
            await saveLocalNote(latestNote, false);
            this.onConflict?.(id, latestNote.version);
            return latestNote;
          } catch {
            this.onConflict?.(id, existingNote.version);
            return updatedNote;
          }
        }
        console.error('Failed to update note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Update,
          payload: JSON.stringify(updateData),
          baseVersion: existingNote.version,
        });
        await this.updatePendingCount();
        return updatedNote;
      }
    } else if (!id.startsWith('local_')) {
      await addToSyncQueue({
        entityType: 'note',
        entityId: id,
        operation: SyncOperation.Update,
        payload: JSON.stringify(updateData),
        baseVersion: existingNote.version,
      });
      await this.updatePendingCount();
    }
    return updatedNote;
  }

  async moveNoteToCategory(id: string, categoryId: string | undefined): Promise<Note> {
    const existingNote = await getLocalNote(id);
    if (!existingNote) {
      throw new Error('Note not found locally');
    }

    // If it's a local note that hasn't synced yet, just update locally
    if (id.startsWith('local_')) {
      const updatedNote: Note = {
        ...existingNote,
        categoryId,
        updatedAt: new Date().toISOString(),
      };
      await saveLocalNote(updatedNote, true);
      return updatedNote;
    }

    return this.updateNote(id, {
      content: existingNote.content,
      categoryId,
      deviceId: this.getDeviceId(existingNote.deviceId),
    });
  }

  async archiveNote(id: string): Promise<void> {
    const note = await getLocalNote(id);
    if (note) {
      note.status = NoteStatus.Archived;
      note.updatedAt = new Date().toISOString();
      await saveLocalNote(note, id.startsWith('local_'));
    }

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.archiveNote(id, this.getDeviceId(note?.deviceId));
      } catch (error) {
        console.error('Failed to archive note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Archive,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
      }
    } else if (!id.startsWith('local_')) {
      await addToSyncQueue({
        entityType: 'note',
        entityId: id,
        operation: SyncOperation.Archive,
        payload: '{}',
        baseVersion: null,
      });
      await this.updatePendingCount();
    }
  }

  async restoreNote(id: string): Promise<void> {
    const note = await getLocalNote(id);
    if (note) {
      note.status = NoteStatus.Inbox;
      note.updatedAt = new Date().toISOString();
      await saveLocalNote(note, id.startsWith('local_'));
    }

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.restoreNote(id, this.getDeviceId(note?.deviceId));
      } catch (error) {
        console.error('Failed to restore note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Restore,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
      }
    } else if (!id.startsWith('local_')) {
      await addToSyncQueue({
        entityType: 'note',
        entityId: id,
        operation: SyncOperation.Restore,
        payload: '{}',
        baseVersion: null,
      });
      await this.updatePendingCount();
    }
  }

  async trashNote(id: string): Promise<void> {
    const note = await getLocalNote(id);
    if (note) {
      note.status = NoteStatus.Trash;
      note.updatedAt = new Date().toISOString();
      await saveLocalNote(note, id.startsWith('local_'));
    }

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.trashNote(id, this.getDeviceId(note?.deviceId));
      } catch (error) {
        console.error('Failed to trash note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Trash,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
      }
    } else if (!id.startsWith('local_')) {
      await addToSyncQueue({
        entityType: 'note',
        entityId: id,
        operation: SyncOperation.Trash,
        payload: '{}',
        baseVersion: null,
      });
      await this.updatePendingCount();
    }
  }

  async deleteNotePermanently(id: string): Promise<void> {
    const note = await getLocalNote(id);
    await deleteLocalNote(id);

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.deleteNotePermanently(id, this.getDeviceId(note?.deviceId));
      } catch (error) {
        console.error('Failed to delete note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Delete,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
      }
    } else if (!id.startsWith('local_')) {
      await addToSyncQueue({
        entityType: 'note',
        entityId: id,
        operation: SyncOperation.Delete,
        payload: '{}',
        baseVersion: null,
      });
      await this.updatePendingCount();
    }
  }

  // Category operations
  async getCategories(): Promise<Category[]> {
    const localCategories = await getLocalCategories();
    const counts = await getCategoryCounts();

    const categoriesWithCounts = localCategories.map((cat) => ({
      ...cat,
      noteCount: counts[cat.id] || 0,
    }));

    if (this.isOnline) {
      this.api.getCategories()
        .then(async (categories) => {
          await bulkSaveCategories(categories);
        })
        .catch(console.error);
    }

    return categoriesWithCounts;
  }

  async createCategory(data: CreateCategoryDto): Promise<Category> {
    const now = new Date().toISOString();
    const tempId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const localCategory: Category = {
      id: tempId,
      name: data.name,
      color: data.color,
      icon: data.icon,
      sortOrder: 0,
      noteCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await saveLocalCategory(localCategory, true);

    if (this.isOnline) {
      try {
        const serverCategory = await this.api.createCategory(data);
        await deleteLocalCategory(tempId);
        await saveLocalCategory(serverCategory, false);
        return serverCategory;
      } catch (error) {
        console.error('Failed to create category on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'category',
          entityId: tempId,
          operation: SyncOperation.Create,
          payload: JSON.stringify(data),
          baseVersion: null,
        });
        await this.updatePendingCount();
        return localCategory;
      }
    } else {
      await addToSyncQueue({
        entityType: 'category',
        entityId: tempId,
        operation: SyncOperation.Create,
        payload: JSON.stringify(data),
        baseVersion: null,
      });
      await this.updatePendingCount();
      return localCategory;
    }
  }

  async updateCategory(id: string, data: UpdateCategoryDto): Promise<Category> {
    const localCategories = await getLocalCategories();
    const existingCategory = localCategories.find((c) => c.id === id);

    if (!existingCategory) {
      throw new Error('Category not found');
    }

    const updatedCategory: Category = {
      ...existingCategory,
      name: data.name,
      color: data.color,
      icon: data.icon,
      sortOrder: data.sortOrder ?? existingCategory.sortOrder,
      updatedAt: new Date().toISOString(),
    };

    await saveLocalCategory(updatedCategory, id.startsWith('local_'));

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        const serverCategory = await this.api.updateCategory(id, data);
        await saveLocalCategory(serverCategory, false);
        return serverCategory;
      } catch (error) {
        console.error('Failed to update category on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'category',
          entityId: id,
          operation: SyncOperation.Update,
          payload: JSON.stringify(data),
          baseVersion: null,
        });
        await this.updatePendingCount();
        return updatedCategory;
      }
    } else if (!id.startsWith('local_')) {
      await addToSyncQueue({
        entityType: 'category',
        entityId: id,
        operation: SyncOperation.Update,
        payload: JSON.stringify(data),
        baseVersion: null,
      });
      await this.updatePendingCount();
    }

    return updatedCategory;
  }

  async deleteCategory(id: string): Promise<void> {
    await deleteLocalCategory(id);

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.deleteCategory(id);
      } catch (error) {
        console.error('Failed to delete category on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'category',
          entityId: id,
          operation: SyncOperation.Delete,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
      }
    } else if (!id.startsWith('local_')) {
      await addToSyncQueue({
        entityType: 'category',
        entityId: id,
        operation: SyncOperation.Delete,
        payload: '{}',
        baseVersion: null,
      });
      await this.updatePendingCount();
    }
  }

  async getInboxCount(): Promise<number> {
    return getLocalInboxCount();
  }

  async clearAllData(): Promise<void> {
    await clearLocalData();
  }

  async clearPendingSyncs(): Promise<void> {
    await clearSyncQueue();
    await this.updatePendingCount();
  }
}
