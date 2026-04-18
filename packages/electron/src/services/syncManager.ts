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
  h4,
} from '@shared/index';
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
  SyncOperation,
  getInboxCount as getLocalInboxCount,
  getCategoryCounts,
  remapCategoryReferences,
} from './database';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface QueuedCreateNotePayload extends CreateNoteDto {
  status?: NoteStatus;
}

export interface SyncManagerOptions {
  api: ApiClient;
  deviceId: string;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onPendingCountChange?: (count: number) => void;
  onDataRefresh?: () => void;
  onAuthError?: () => void;
  onConflict?: (noteId: string, serverVersion: number) => void;
  onSyncItemFailed?: (item: import('./database').SyncQueueItem) => void;
}

export class SyncManager {
  private api: ApiClient;
  private isOnline: boolean = navigator.onLine;
  private syncStatus: SyncStatus = 'idle';
  private syncInProgress: boolean = false;
  private needsResync: boolean = false;
  private authErrorDetected: boolean = false;
  private deviceId: string = '';
  private onSyncStatusChange?: (status: SyncStatus) => void;
  private onPendingCountChange?: (count: number) => void;
  private onDataRefresh?: () => void;
  private onAuthError?: () => void;
  private onConflict?: (noteId: string, serverVersion: number) => void;
  private onSyncItemFailed?: (item: import('./database').SyncQueueItem) => void;

  constructor(options: SyncManagerOptions) {
    this.api = options.api;
    this.deviceId = options.deviceId;
    this.onSyncStatusChange = options.onSyncStatusChange;
    this.onPendingCountChange = options.onPendingCountChange;
    this.onDataRefresh = options.onDataRefresh;
    this.onAuthError = options.onAuthError;
    this.onConflict = options.onConflict;
    this.onSyncItemFailed = options.onSyncItemFailed;

    // Set up online/offline listeners
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Initial status
    this.updateSyncStatus(navigator.onLine ? 'idle' : 'offline');
  }

  destroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  private handleOnline = async (): Promise<void> => {
    h4.info('Network status: online', { previousStatus: this.syncStatus });
    this.isOnline = true;
    this.updateSyncStatus('idle');
    // Process any pending operations
    await this.processSyncQueue();
  };

  private handleOffline = (): void => {
    h4.warning('Network status: offline', { previousStatus: this.syncStatus });
    this.isOnline = false;
    this.updateSyncStatus('offline');
  };

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

  private isAuthError(error: unknown): boolean {
    return error instanceof HttpError && error.status === 401;
  }

  private handleAuthError(): void {
    if (this.authErrorDetected) return;
    this.authErrorDetected = true;
    this.updateSyncStatus('error');
    this.onAuthError?.();
  }

  private isConflictError(error: unknown): boolean {
    return (error instanceof HttpError && error.status === 409)
      || (typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 409);
  }

  // Initial data sync - fetch from server and populate local DB
  async initialSync(): Promise<void> {
    if (!this.isOnline) {
      h4.warning('Initial sync skipped: offline');
      return;
    }

    try {
      this.updateSyncStatus('syncing');
      h4.info('Initial sync starting');

      // Fetch first page of notes and all categories in parallel
      const [firstPage, categories] = await Promise.all([
        this.api.getNotes({ pageSize: 1000, page: 1 }),
        this.api.getCategories(),
      ]);

      let allNotes = firstPage.notes;

      // Paginate remaining notes if needed
      let page = 2;
      while (allNotes.length < firstPage.totalCount) {
        const nextPage = await this.api.getNotes({ pageSize: 1000, page });
        allNotes = allNotes.concat(nextPage.notes);
        page++;
      }

      // Save to local DB
      await bulkSaveNotes(allNotes);
      await bulkSaveCategories(categories);

      const pendingCount = await getSyncQueueCount();
      h4.info('Initial sync complete', {
        serverNoteCount: allNotes.length,
        serverTotalCount: firstPage.totalCount,
        categoryCount: categories.length,
        pendingQueueSize: pendingCount,
        pages: page - 1,
        notesByStatus: {
          inbox: allNotes.filter(n => n.status === NoteStatus.Inbox).length,
          archived: allNotes.filter(n => n.status === NoteStatus.Archived).length,
          trash: allNotes.filter(n => n.status === NoteStatus.Trash).length,
        },
      });

      this.updateSyncStatus('idle');

      // Process any pending outbound changes (e.g. externally created notes)
      await this.processSyncQueue();
    } catch (error) {
      h4.error('Initial sync failed', { error: (error as Error).message });
      if (this.isAuthError(error)) {
        this.handleAuthError();
        return;
      }
      this.updateSyncStatus('error');
    }
  }

  // Process pending sync queue (self-draining: if called while busy, will
  // re-run after the current pass finishes so no queued items are stranded)
  async processSyncQueue(): Promise<void> {
    if (!this.isOnline || this.authErrorDetected) return;

    if (this.syncInProgress) {
      this.needsResync = true;
      return;
    }

    this.syncInProgress = true;
    this.updateSyncStatus('syncing');

    try {
      // Drain loop: keep processing until the queue is empty or we're blocked
      let queue = await getSyncQueue();
      const hadItems = queue.length > 0;
      let hasRetryRequiredItems = false;
      while (queue.length > 0) {
        h4.info('Processing sync queue', {
          queueSize: queue.length,
          operations: queue.map(i => `${i.operation}:${i.entityType}:${i.entityId}`).join(', '),
        });

        let queueInvalidated = false;
        let queueBlocked = false;
        for (const item of queue) {
          try {
            const payload = JSON.parse(item.payload);

            switch (item.operation) {
              case SyncOperation.Create:
                if (item.entityType === 'note') {
                  const notePayload = payload as QueuedCreateNotePayload;
                  const localNote = item.entityId.startsWith('local_')
                    ? await getLocalNote(item.entityId)
                    : null;

                  if (item.entityId.startsWith('local_') && !localNote) {
                    h4.warning('Dropping stale local note create', {
                      itemId: item.id,
                      noteId: item.entityId,
                    });
                    break;
                  }

                  const createRequest: CreateNoteDto = {
                    content: localNote?.content ?? notePayload.content,
                    categoryId: localNote?.categoryId ?? notePayload.categoryId,
                    deviceId: localNote?.deviceId ?? notePayload.deviceId,
                  };
                  const finalStatus = localNote?.status ?? notePayload.status ?? NoteStatus.Inbox;
                  const finalDeviceId = localNote?.deviceId ?? notePayload.deviceId;

                  let serverNote = await this.api.createNote(createRequest);

                  if (finalStatus === NoteStatus.Archived) {
                    serverNote = await this.api.archiveNote(serverNote.id, finalDeviceId);
                  } else if (finalStatus === NoteStatus.Trash) {
                    await this.api.trashNote(serverNote.id, finalDeviceId);
                    serverNote = await this.api.getNote(serverNote.id);
                  }

                  // Update local note with server ID
                  if (localNote) {
                    await deleteLocalNote(item.entityId);
                  }
                  await saveLocalNote(serverNote, false);
                } else if (item.entityType === 'category') {
                  const localCategory = item.entityId.startsWith('local_')
                    ? (await getLocalCategories()).find((category) => category.id === item.entityId) ?? null
                    : null;

                  if (item.entityId.startsWith('local_') && !localCategory) {
                    h4.warning('Dropping stale local category create', {
                      itemId: item.id,
                      categoryId: item.entityId,
                    });
                    break;
                  }

                  const categoryPayload = payload as CreateCategoryDto;
                  const newCategory = await this.api.createCategory({
                    name: localCategory?.name ?? categoryPayload.name,
                    color: localCategory?.color ?? categoryPayload.color,
                    icon: localCategory?.icon ?? categoryPayload.icon,
                  });
                  await saveLocalCategory(newCategory, false);
                  await remapCategoryReferences(item.entityId, newCategory.id);
                  if (localCategory) {
                    await deleteLocalCategory(item.entityId);
                  }
                  queueInvalidated = true;
                }
                break;

              case SyncOperation.Update:
                if (item.entityType === 'note') {
                  const updatePayload = payload as UpdateNoteDto;
                  const localNote = await getLocalNote(item.entityId);
                  const updatedNote = await this.api.updateNote(item.entityId, {
                    ...updatePayload,
                    deviceId: updatePayload.deviceId ?? localNote?.deviceId ?? (this.deviceId || undefined),
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

            // Remove from queue on success
            h4.info('Sync queue item completed', { itemId: item.id, operation: item.operation, entityType: item.entityType, entityId: item.entityId });
            await removeSyncQueueItem(item.id);
            await this.updatePendingCount();
          } catch (error) {
            if (this.isAuthError(error)) {
              h4.error('Sync queue auth error, pausing', { itemId: item.id });
              // Leave items in queue so they sync after re-login
              this.handleAuthError();
              return;
            }
            if (item.operation === SyncOperation.Update && item.entityType === 'note' && this.isConflictError(error)) {
              try {
                const latestNote = await this.api.getNote(item.entityId);
                await saveLocalNote(latestNote, false);
                await removeSyncQueueItem(item.id);
                await this.updatePendingCount();
                this.onConflict?.(item.entityId, latestNote.version);
                continue;
              } catch (refreshError) {
                h4.error('Failed to refresh conflicted note during sync', {
                  itemId: item.id,
                  noteId: item.entityId,
                  error: (refreshError as Error).message,
                });
              }
            }
            const errorMessage = (error as Error).message;
            h4.error('Sync queue item failed', { itemId: item.id, operation: item.operation, entityType: item.entityType, entityId: item.entityId, error: errorMessage, retryCount: item.retryCount });
            await updateSyncQueueItemError(item.id, errorMessage);

            const nextRetryCount = item.retryCount + 1;
            if (nextRetryCount >= 3) {
              hasRetryRequiredItems = true;
              if (nextRetryCount === 3) {
                h4.error('Sync queue item requires manual retry', {
                  itemId: item.id,
                  operation: item.operation,
                  entityType: item.entityType,
                  entityId: item.entityId,
                  lastError: errorMessage,
                });
                this.onSyncItemFailed?.({
                  ...item,
                  retryCount: nextRetryCount,
                  lastError: errorMessage,
                });
              }
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

        // Clear the flag before re-reading — any new call during the next
        // getSyncQueue() will set it again if needed.
        this.needsResync = false;

        // Re-read queue to pick up items added during this pass
        queue = await getSyncQueue();
      }

      this.updateSyncStatus(hasRetryRequiredItems ? 'error' : 'idle');
      // Only trigger a data refresh if we actually synced something —
      // otherwise idle polling generates constant API traffic for nothing
      if (hadItems) {
        this.onDataRefresh?.();
      }
    } catch (error) {
      h4.error('Sync queue processing failed', { error: (error as Error).message });
      this.updateSyncStatus('error');
    } finally {
      this.syncInProgress = false;
      // If someone called processSyncQueue() while we were in the finally
      // block or between the last queue check and here, drain again.
      if (this.needsResync) {
        this.needsResync = false;
        this.processSyncQueue();
      }
    }
  }

  // Note operations with offline support
  async getNotes(params: { status?: NoteStatus; categoryId?: string }): Promise<Note[]> {
    // Read from local DB — no background server fetch.
    // Data freshness is maintained by initialSync() (startup / reconnection),
    // SignalR events (real-time), and the sync queue (offline changes).
    return getLocalNotes(params);
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

    // Save locally first
    await saveLocalNote(localNote, true);
    h4.info('Note created locally', { tempId, categoryId: data.categoryId, deviceId: data.deviceId, online: this.isOnline });

    if (this.isOnline) {
      try {
        // Try to create on server
        const serverNote = await this.api.createNote(data);
        // Update local with server data
        await deleteLocalNote(tempId);
        await saveLocalNote(serverNote, false);
        h4.info('Note synced to server', { tempId, serverId: serverNote.id, version: serverNote.version });
        return serverNote;
      } catch (error) {
        h4.error('Note create failed on server, queued', { tempId, error: (error as Error).message });
        await addToSyncQueue({
          entityType: 'note',
          entityId: tempId,
          operation: SyncOperation.Create,
          payload: JSON.stringify(data),
          baseVersion: null,
        });
        await this.updatePendingCount();
        if (this.isAuthError(error)) this.handleAuthError();
        return localNote;
      }
    } else {
      h4.info('Note queued for sync (offline)', { tempId });
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
      h4.error('Note update failed: not found locally', { noteId: id });
      throw new Error('Note not found');
    }

    const updatedNote: Note = {
      ...existingNote,
      content: data.content,
      categoryId: data.categoryId,
      version: existingNote.version + 1,
      updatedAt: new Date().toISOString(),
    };

    // Save locally first
    await saveLocalNote(updatedNote, existingNote.id.startsWith('local_'));
    h4.info('Note updated locally', { noteId: id, localVersion: updatedNote.version, previousVersion: existingNote.version, categoryId: data.categoryId, online: this.isOnline });

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        const serverNote = await this.api.updateNote(id, { ...data, baseVersion: existingNote.version });
        await saveLocalNote(serverNote, false);
        h4.info('Note update synced to server', { noteId: id, serverVersion: serverNote.version });
        return serverNote;
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) {
          h4.warning('Note update conflict detected', { noteId: id, localVersion: existingNote.version });
          // Fetch latest from server and update local DB
          try {
            const latestNote = await this.api.getNote(id);
            await saveLocalNote(latestNote, false);
            this.onConflict?.(id, latestNote.version);
            return latestNote;
          } catch {
            // If we can't fetch, return what we have
            this.onConflict?.(id, existingNote.version);
            return updatedNote;
          }
        }
        h4.error('Note update failed on server, queued', { noteId: id, error: (error as Error).message, baseVersion: existingNote.version });
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Update,
          payload: JSON.stringify(data),
          baseVersion: existingNote.version,
        });
        await this.updatePendingCount();
        if (this.isAuthError(error)) this.handleAuthError();
        return updatedNote;
      }
    } else {
      // Queue for later sync (only if not a local-only note)
      if (!id.startsWith('local_')) {
        h4.info('Note update queued for sync', { noteId: id, offline: !this.isOnline });
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
  }

  async archiveNote(id: string): Promise<void> {
    const note = await getLocalNote(id);
    if (note) {
      note.status = NoteStatus.Archived;
      note.updatedAt = new Date().toISOString();
      await saveLocalNote(note, id.startsWith('local_'));
    }
    h4.info('Note archived locally', { noteId: id, online: this.isOnline });

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.archiveNote(id, this.deviceId);
        h4.info('Note archive synced to server', { noteId: id });
      } catch (error) {
        h4.error('Note archive failed on server, queued', { noteId: id, error: (error as Error).message });
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Archive,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
        if (this.isAuthError(error)) this.handleAuthError();
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
    h4.info('Note restored locally', { noteId: id, online: this.isOnline });

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.restoreNote(id, this.deviceId);
        h4.info('Note restore synced to server', { noteId: id });
      } catch (error) {
        h4.error('Note restore failed on server, queued', { noteId: id, error: (error as Error).message });
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Restore,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
        if (this.isAuthError(error)) this.handleAuthError();
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
    h4.info('Note trashed locally', { noteId: id, online: this.isOnline });

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.trashNote(id, this.deviceId);
        h4.info('Note trash synced to server', { noteId: id });
      } catch (error) {
        h4.error('Note trash failed on server, queued', { noteId: id, error: (error as Error).message });
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Trash,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
        if (this.isAuthError(error)) this.handleAuthError();
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
    h4.info('Note permanently deleted locally', { noteId: id, online: this.isOnline });

    if (this.isOnline && !id.startsWith('local_')) {
      try {
        await this.api.deleteNotePermanently(id, this.deviceId);
        h4.info('Note permanent delete synced to server', { noteId: id });
      } catch (error) {
        h4.error('Note permanent delete failed on server, queued', { noteId: id, error: (error as Error).message });
        await addToSyncQueue({
          entityType: 'note',
          entityId: id,
          operation: SyncOperation.Delete,
          payload: '{}',
          baseVersion: null,
        });
        await this.updatePendingCount();
        if (this.isAuthError(error)) this.handleAuthError();
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

  // Get categories from local DB — no API call, just reads local data with counts
  async getCategories(): Promise<Category[]> {
    const localCategories = await getLocalCategories();
    const counts = await getCategoryCounts();
    return localCategories.map((cat) => ({
      ...cat,
      noteCount: counts[cat.id] || 0,
    }));
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
        if (this.isAuthError(error)) this.handleAuthError();
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
        if (this.isAuthError(error)) this.handleAuthError();
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
        if (this.isAuthError(error)) this.handleAuthError();
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

  async getPendingNoteIds(): Promise<Set<string>> {
    const queue = await getSyncQueue();
    const noteIds = new Set<string>();
    for (const item of queue) {
      if (item.entityType === 'note') {
        noteIds.add(item.entityId);
      }
    }
    return noteIds;
  }

  // Get inbox count from local DB
  async getInboxCount(): Promise<number> {
    return getLocalInboxCount();
  }

  // Clear all local data (for logout)
  async clearAllData(): Promise<void> {
    await clearLocalData();
  }
}
