import {
  User,
  RegisterDto,
  LoginDto,
  UpdateUserDto,
  AuthResponse,
  ApiError,
  HttpError,
  Note,
  CreateNoteDto,
  UpdateNoteDto,
  MoveNoteDto,
  NoteListResponse,
  NoteHistory,
  NotesQueryParams,
  Category,
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
} from './types';

export function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const normalized = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(normalized));
    if (typeof decoded.exp === 'number') {
      return decoded.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  getTokenExpiryMs(): number | null {
    if (!this.token) return null;
    return getTokenExpiryMs(this.token);
  }

  private getAccessToken(response: AuthResponse): string {
    return response.accessToken || response.token || '';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: response.statusText,
      }));
      throw new HttpError(response.status, error.message);
    }

    // Handle empty responses (204 No Content or empty body)
    const contentLength = response.headers.get('content-length');
    if (response.status === 204 || contentLength === '0') {
      return undefined as T;
    }

    // Try to parse JSON, return undefined if empty
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text);
  }

  async register(data: RegisterDto): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const accessToken = this.getAccessToken(response);
    this.setToken(accessToken);
    return { ...response, accessToken };
  }

  async login(data: LoginDto): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const accessToken = this.getAccessToken(response);
    this.setToken(accessToken);
    return { ...response, accessToken };
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    const accessToken = this.getAccessToken(response);
    this.setToken(accessToken);
    return { ...response, accessToken };
  }

  async logoutSession(refreshToken: string): Promise<void> {
    await this.request<void>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/api/users/me');
  }

  async updateCurrentUser(data: UpdateUserDto): Promise<User> {
    return this.request<User>('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  logout() {
    this.setToken(null);
  }

  // Notes API
  async getNotes(params?: NotesQueryParams): Promise<NoteListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status !== undefined) searchParams.set('status', String(params.status));
    if (params?.categoryId) searchParams.set('categoryId', params.categoryId);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));

    const query = searchParams.toString();
    return this.request<NoteListResponse>(`/api/notes${query ? `?${query}` : ''}`);
  }

  async getNote(id: string): Promise<Note> {
    return this.request<Note>(`/api/notes/${id}`);
  }

  async createNote(data: CreateNoteDto): Promise<Note> {
    return this.request<Note>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNote(id: string, data: UpdateNoteDto): Promise<Note> {
    return this.request<Note>(`/api/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async archiveNote(id: string, deviceId?: string): Promise<Note> {
    const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
    return this.request<Note>(`/api/notes/${id}/archive${query}`, {
      method: 'POST',
    });
  }

  async restoreNote(id: string, deviceId?: string): Promise<Note> {
    const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
    return this.request<Note>(`/api/notes/${id}/restore${query}`, {
      method: 'POST',
    });
  }

  async trashNote(id: string, deviceId?: string): Promise<void> {
    const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
    await this.request<void>(`/api/notes/${id}${query}`, {
      method: 'DELETE',
    });
  }

  async deleteNotePermanently(id: string, deviceId?: string): Promise<void> {
    const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
    await this.request<void>(`/api/notes/${id}/permanent${query}`, {
      method: 'DELETE',
    });
  }

  async emptyTrash(): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/notes/empty-trash', {
      method: 'POST',
    });
  }

  async moveNote(id: string, data: MoveNoteDto): Promise<Note> {
    return this.request<Note>(`/api/notes/${id}/move`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getNoteHistory(id: string): Promise<NoteHistory[]> {
    return this.request<NoteHistory[]>(`/api/notes/${id}/history`);
  }

  // Categories API
  async getCategories(): Promise<Category[]> {
    return this.request<Category[]>('/api/categories');
  }

  async getCategory(id: string): Promise<Category> {
    return this.request<Category>(`/api/categories/${id}`);
  }

  async createCategory(data: CreateCategoryDto): Promise<Category> {
    return this.request<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCategory(id: string, data: UpdateCategoryDto): Promise<Category> {
    return this.request<Category>(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request<void>(`/api/categories/${id}`, {
      method: 'DELETE',
    });
  }

  async reorderCategories(data: ReorderCategoriesDto): Promise<Category[]> {
    return this.request<Category[]>('/api/categories/reorder', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}
