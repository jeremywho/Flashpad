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
} from './database';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncManagerOptions {
  api: ApiClient;
  deviceId: string;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onPendingCountChange?: (count: number) => void;
  onDataRefresh?: () => void;
  onAuthError?: () => void;
  onConflict?: (noteId: string, serverVersion: number) => void;
}

export class SyncManager {
  private api: ApiClient;
  private isOnline: boolean = navigator.onLine;
  private syncStatus: SyncStatus = 'idle';
  private syncInProgress: boolean = false;
  private authErrorDetected: boolean = false;
  private deviceId: string = '';
  private onSyncStatusChange?: (status: SyncStatus) => void;
  private onPendingCountChange?: (count: number) => void;
  private onDataRefresh?: () => void;
  private onAuthError?: () => void;
  private onConflict?: (noteId: string, serverVersion: number) => void;

  constructor(options: SyncManagerOptions) {
    this.api = options.api;
    this.deviceId = options.deviceId;
    this.onSyncStatusChange = options.onSyncStatusChange;
    this.onPendingCountChange = options.onPendingCountChange;
    this.onDataRefresh = options.onDataRefresh;
    this.onAuthError = options.onAuthError;
    this.onConflict = options.onConflict;

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

  // Initial data sync - fetch from server and populate local DB
  async initialSync(): Promise<void> {
    if (!this.isOnline) {
      h4.warning('Initial sync skipped: offline');
      return;
    }

    try {
      this.updateSyncStatus('syncing');
      h4.info('Initial sync starting');

      // Fetch all notes and categories from server
      const [notesResponse, categories] = await Promise.all([
        this.api.getNotes({ pageSize: 1000 }),
        this.api.getCategories(),
      ]);

      // Save to local DB
      await bulkSaveNotes(notesResponse.notes);
      await bulkSaveCategories(categories);

      const pendingCount = await getSyncQueueCount();
      h4.info('Initial sync complete', {
        serverNoteCount: notesResponse.notes.length,
        serverTotalCount: notesResponse.totalCount,
        categoryCount: categories.length,
        pendingQueueSize: pendingCount,
        notesByStatus: {
          inbox: notesResponse.notes.filter(n => n.status === NoteStatus.Inbox).length,
          archived: notesResponse.notes.filter(n => n.status === NoteStatus.Archived).length,
          trash: notesResponse.notes.filter(n => n.status === NoteStatus.Trash).length,
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

  // Process pending sync queue
  async processSyncQueue(): Promise<void> {
    if (!this.isOnline || this.syncInProgress || this.authErrorDetected) return;

    this.syncInProgress = true;
    this.updateSyncStatus('syncing');

    try {
      const queue = await getSyncQueue();
      if (queue.length > 0) {
        h4.info('Processing sync queue', {
          queueSize: queue.length,
          operations: queue.map(i => `${i.operation}:${i.entityType}:${i.entityId}`).join(', '),
        });
      }

      for (const item of queue) {
        try {
          const payload = JSON.parse(item.payload);

          switch (item.operation) {
            case SyncOperation.Create:
              if (item.entityType === 'note') {
                const newNote = await this.api.createNote(payload as CreateNoteDto);
                // Update local note with server ID
                const localNote = await getLocalNote(item.entityId);
                if (localNote) {
                  await deleteLocalNote(item.entityId);
                  await saveLocalNote(newNote, false);
                }
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
          h4.error('Sync queue item failed', { itemId: item.id, operation: item.operation, entityType: item.entityType, entityId: item.entityId, error: (error as Error).message, retryCount: item.retryCount });
          await updateSyncQueueItemError(item.id, (error as Error).message);

          // If we've retried too many times, skip this item
          if (item.retryCount >= 3) {
            h4.error('Sync queue item abandoned after 3 retries', { itemId: item.id, operation: item.operation, entityType: item.entityType, entityId: item.entityId });
            await removeSyncQueueItem(item.id);
          }
        }
      }

      this.updateSyncStatus('idle');
      this.onDataRefresh?.();
    } catch (error) {
      h4.error('Sync queue processing failed', { error: (error as Error).message });
      this.updateSyncStatus('error');
    } finally {
      this.syncInProgress = false;
    }
  }

  // Note operations with offline support
  async getNotes(params: { status?: NoteStatus; categoryId?: string }): Promise<Note[]> {
    // Always read from local DB first for instant response
    const localNotes = await getLocalNotes(params);

    // If online, also fetch from server and update local DB in background
    if (this.isOnline) {
      this.api.getNotes({ ...params, pageSize: 1000 })
        .then(async (response) => {
          await bulkSaveNotes(response.notes);
          h4.debug('Background notes refresh', { status: params.status, categoryId: params.categoryId, localCount: localNotes.length, serverCount: response.notes.length, serverTotal: response.totalCount });
        })
        .catch((error) => {
          if (this.isAuthError(error)) {
            this.handleAuthError();
            return;
          }
          h4.error('Background notes refresh failed', { error: (error as Error).message });
        });
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
