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
  SyncOperation,
  getInboxCount as getLocalInboxCount,
  getCategoryCounts,
} from './database';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncManagerOptions {
  api: ApiClient;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onPendingCountChange?: (count: number) => void;
  onDataRefresh?: () => void;
}

export class SyncManager {
  private api: ApiClient;
  private isOnline: boolean = true;
  private syncStatus: SyncStatus = 'idle';
  private syncInProgress: boolean = false;
  private onSyncStatusChange?: (status: SyncStatus) => void;
  private onPendingCountChange?: (count: number) => void;
  private onDataRefresh?: () => void;
  private netInfoUnsubscribe?: () => void;
  private appStateSubscription?: { remove: () => void };

  constructor(options: SyncManagerOptions) {
    this.api = options.api;
    this.onSyncStatusChange = options.onSyncStatusChange;
    this.onPendingCountChange = options.onPendingCountChange;
    this.onDataRefresh = options.onDataRefresh;

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
      const queue = await getSyncQueue();

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
                const newNote = await this.api.createNote(payload as CreateNoteDto);
                await deleteLocalNote(item.entityId);
                await saveLocalNote(newNote, false);
              } else if (item.entityType === 'category') {
                const newCategory = await this.api.createCategory(payload as CreateCategoryDto);
                await deleteLocalCategory(item.entityId);
                await saveLocalCategory(newCategory, false);
              }
              break;

            case SyncOperation.Update:
              if (item.entityType === 'note') {
                const updatedNote = await this.api.updateNote(item.entityId, payload as UpdateNoteDto);
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

          // Immediately remove items that reference non-existent resources
          if (errorMessage.includes('not found') || errorMessage.includes('Not found')) {
            console.warn(`Removing sync item ${item.id} - resource no longer exists`);
            await removeSyncQueueItem(item.id);
            await this.updatePendingCount();
            continue;
          }

          await updateSyncQueueItemError(item.id, errorMessage);

          if (item.retryCount >= 3) {
            console.warn(`Giving up on sync item ${item.id} after 3 retries`);
            await removeSyncQueueItem(item.id);
          }
        }
      }

      this.updateSyncStatus('idle');
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

    const localNote: Note = {
      id: tempId,
      content: data.content,
      categoryId: data.categoryId,
      status: NoteStatus.Inbox,
      version: 1,
      deviceId: data.deviceId,
      createdAt: now,
      updatedAt: now,
    };

    await saveLocalNote(localNote, true);

    if (this.isOnline) {
      try {
        const serverNote = await this.api.createNote(data);
        await deleteLocalNote(tempId);
        await saveLocalNote(serverNote, false);
        return serverNote;
      } catch (error) {
        console.error('Failed to create note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: tempId,
          operation: SyncOperation.Create,
          payload: JSON.stringify(data),
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
        payload: JSON.stringify(data),
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

    const updatedNote: Note = {
      ...existingNote,
      content: data.content,
      categoryId: data.categoryId,
      version: existingNote.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await saveLocalNote(updatedNote, id.startsWith('local_'));

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        const serverNote = await this.api.updateNote(id, data);
        await saveLocalNote(serverNote, false);
        return serverNote;
      } catch (error) {
        console.error('Failed to update note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Update,
          payload: JSON.stringify(data),
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
        payload: JSON.stringify(data),
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

    // Update local note
    const updatedNote: Note = {
      ...existingNote,
      categoryId: categoryId,
      updatedAt: new Date().toISOString(),
    };

    await saveLocalNote(updatedNote, id.startsWith('local_'));

    // If it's a local note that hasn't synced yet, just update locally
    if (id.startsWith('local_')) {
      return updatedNote;
    }

    // Try to sync with server
    if (this.isOnline) {
      try {
        const serverNote = await this.api.moveNote(id, { categoryId });
        await saveLocalNote(serverNote, false);
        return serverNote;
      } catch (error) {
        console.error('Failed to move note on server, queuing:', error);
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Move,
          payload: JSON.stringify({ categoryId }),
          baseVersion: null,
        });
        await this.updatePendingCount();
        return updatedNote;
      }
    } else {
      await addToSyncQueue({
        entityType: 'note',
        entityId: id,
        operation: SyncOperation.Move,
        payload: JSON.stringify({ categoryId }),
        baseVersion: null,
      });
      await this.updatePendingCount();
    }

    return updatedNote;
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
        await this.api.archiveNote(id);
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
        await this.api.restoreNote(id);
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
        await this.api.trashNote(id);
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
    await deleteLocalNote(id);

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.deleteNotePermanently(id);
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
