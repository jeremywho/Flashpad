import {
  User,
  RegisterDto,
  LoginDto,
  UpdateUserDto,
  AuthResponse,
  ApiError,
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
      throw new Error(error.message);
    }

    return response.json();
  }

  async register(data: RegisterDto): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(response.token);
    return response;
  }

  async login(data: LoginDto): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(response.token);
    return response;
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

  async archiveNote(id: string): Promise<Note> {
    return this.request<Note>(`/api/notes/${id}/archive`, {
      method: 'POST',
    });
  }

  async restoreNote(id: string): Promise<Note> {
    return this.request<Note>(`/api/notes/${id}/restore`, {
      method: 'POST',
    });
  }

  async trashNote(id: string): Promise<void> {
    await this.request<void>(`/api/notes/${id}`, {
      method: 'DELETE',
    });
  }

  async deleteNotePermanently(id: string): Promise<void> {
    await this.request<void>(`/api/notes/${id}/permanent`, {
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
