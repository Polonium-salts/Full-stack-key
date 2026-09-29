export interface PasswordEntry {
  id: string;
  site: string;
  url?: string;
  username: string;
  encryptedPassword: string;
  encryptedNotes?: string;
  passwordIv: string;
  passwordTag: string;
  notesIv?: string;
  notesTag?: string;
  tags: string[];
  categoryId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  trashed: boolean;
  trashedAt?: string;
}

export type EncryptedPasswordEntry = PasswordEntry;

export interface PasswordEntryDecrypted extends Omit<PasswordEntry, 'encryptedPassword' | 'encryptedNotes' | 'passwordIv' | 'passwordTag' | 'notesIv' | 'notesTag'> {
  password: string;
  notes?: string;
}

export interface PasswordEntryInput {
  site: string;
  url?: string;
  username?: string;
  password: string;
  notes?: string;
  tags?: string[];
  categoryId?: string;
}

export interface PasswordEntryUpdate {
  site?: string;
  url?: string;
  username?: string;
  password?: string;
  notes?: string;
  tags?: string[];
  categoryId?: string;
  version: number;
}

export interface Category {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  keyHash: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  revoked: boolean;
}

export interface AppConfig {
  initialized: boolean;
  masterPasswordHash: string;
  masterSalt: string;
  kekSalt: string;
  pbkdf2Iterations: number;
  createdAt: string;
  apiKeys: ApiKey[];
}

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export interface PasswordListParams extends PaginationParams {
  search?: string;
  categoryId?: string;
  tag?: string;
  trashed?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface SyncResponse {
  created: PasswordEntry[];
  updated: PasswordEntry[];
  deleted: PasswordEntry[];
  syncedAt: string;
}

export interface ImportOptions {
  strategy: 'skip' | 'overwrite' | 'duplicate';
}

export interface ExportData {
  version: string;
  exportedAt: string;
  categories: Category[];
  tags: Tag[];
  passwords: PasswordEntry[];
}
