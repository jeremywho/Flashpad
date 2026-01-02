export interface User {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterDto {
  username: string;
  email: string;
  password: string;
  fullName?: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface UpdateUserDto {
  email?: string;
  fullName?: string;
  password?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiError {
  message: string;
}

// Note types
export enum NoteStatus {
  Inbox = 0,
  Archived = 1,
  Trash = 2,
}

export interface Note {
  id: string;
  content: string;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  status: NoteStatus;
  version: number;
  deviceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteDto {
  content: string;
  categoryId?: string;
  deviceId?: string;
}

export interface UpdateNoteDto {
  content: string;
  categoryId?: string;
  deviceId?: string;
}

export interface MoveNoteDto {
  categoryId?: string;
}

export interface NoteListResponse {
  notes: Note[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface NoteHistory {
  id: string;
  noteId: string;
  content: string;
  version: number;
  deviceId?: string;
  createdAt: string;
}

// Category types
export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
  sortOrder: number;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryDto {
  name: string;
  color: string;
  icon?: string;
}

export interface UpdateCategoryDto {
  name: string;
  color: string;
  icon?: string;
  sortOrder?: number;
}

export interface ReorderCategoriesDto {
  categoryIds: string[];
}

// Notes query params
export interface NotesQueryParams {
  status?: NoteStatus;
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}
