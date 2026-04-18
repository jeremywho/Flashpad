import { NoteStatus } from '@shared/index';

export interface NoteMetadata {
  id: string;
  categoryId: string | null;
  status: NoteStatus;
  version: number;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  isLocal: boolean;
  serverId: string | null;
}

export interface ParsedNote {
  metadata: NoteMetadata;
  content: string;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const NOTE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ALLOWED_DATA_FILENAMES = new Set(['categories.json', 'sync-queue.json', 'device-info.json']);

interface ParsedPathInfo {
  root: string;
  segments: string[];
  isAbsolute: boolean;
}

/**
 * Parse YAML frontmatter from a markdown file content.
 * This is a simple parser that handles the specific format we use.
 */
function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: string | number | boolean | null = trimmed.slice(colonIndex + 1).trim();

    // Handle quoted strings
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Handle null
    else if (value === 'null' || value === '~' || value === '') {
      result[key] = null;
      continue;
    }
    // Handle booleans
    else if (value === 'true') {
      result[key] = true;
      continue;
    } else if (value === 'false') {
      result[key] = false;
      continue;
    }
    // Handle numbers
    else if (!isNaN(Number(value)) && value !== '') {
      result[key] = Number(value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * Serialize an object to YAML format.
 */
function serializeYaml(obj: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${key}: null`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'string') {
      // Quote strings that might be ambiguous
      if (
        value === '' ||
        value === 'null' ||
        value === 'true' ||
        value === 'false' ||
        !isNaN(Number(value)) ||
        value.includes(':') ||
        value.includes('#') ||
        value.includes('\n')
      ) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: "${value}"`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Check whether a note ID is safe to use as a filename segment.
 */
export function isValidNoteId(noteId: string): boolean {
  return NOTE_ID_REGEX.test(noteId);
}

/**
 * Normalize a note ID and return null if it is unsafe.
 */
export function normalizeNoteId(noteId: string): string | null {
  const trimmed = noteId.trim();
  return isValidNoteId(trimmed) ? trimmed : null;
}

/**
 * Resolve a relative path against a base directory and ensure the result stays
 * inside that base directory.
 */
export function resolvePathWithinBaseDir(baseDir: string, relativePath: string): string | null {
  const separator = baseDir.includes('\\') && !baseDir.includes('/') ? '\\' : '/';
  const parsedBase = parsePath(baseDir);
  const parsedTarget = parsePath(relativePath);

  const resolved = parsedTarget.isAbsolute
    ? normalizePath(parsedTarget.root, parsedTarget.segments, separator)
    : normalizePath(parsedBase.root, resolveRelativeSegments(parsedBase.segments, relativePath), separator);

  const normalizedBase = normalizePath(parsedBase.root, parsedBase.segments, separator);
  const baseWithSeparator = normalizedBase.endsWith(separator) ? normalizedBase : `${normalizedBase}${separator}`;

  if (resolved === normalizedBase || resolved.startsWith(baseWithSeparator)) {
    return resolved;
  }

  return null;
}

/**
 * Check whether a JSON file name is one of the known safe data files.
 */
export function isAllowedDataFilename(filename: string): boolean {
  return ALLOWED_DATA_FILENAMES.has(filename);
}

/**
 * Parse a note file content into metadata and content.
 */
export function parseNoteFile(fileContent: string): ParsedNote | null {
  const match = fileContent.match(FRONTMATTER_REGEX);

  if (!match) {
    // No frontmatter found
    return null;
  }

  const yamlContent = match[1];
  const content = match[2];

  try {
    const data = parseYaml(yamlContent);
    const noteId = typeof data.id === 'string' ? normalizeNoteId(data.id) : null;

    if (!noteId) {
      return null;
    }

    const metadata: NoteMetadata = {
      id: noteId,
      categoryId: data.categoryId !== null ? String(data.categoryId) : null,
      status: typeof data.status === 'number' ? data.status : NoteStatus.Inbox,
      version: typeof data.version === 'number' ? data.version : 1,
      deviceId: String(data.deviceId || ''),
      createdAt: String(data.createdAt || new Date().toISOString()),
      updatedAt: String(data.updatedAt || new Date().toISOString()),
      isLocal: data.isLocal === true,
      serverId: data.serverId !== null ? String(data.serverId) : null,
    };

    return { metadata, content };
  } catch {
    return null;
  }
}

/**
 * Serialize a note to markdown file format with YAML frontmatter.
 */
export function serializeNote(
  metadata: NoteMetadata,
  content: string
): string {
  const yamlData: Record<string, unknown> = {
    id: metadata.id,
    categoryId: metadata.categoryId,
    status: metadata.status,
    version: metadata.version,
    deviceId: metadata.deviceId,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    isLocal: metadata.isLocal,
    serverId: metadata.serverId,
  };

  const yaml = serializeYaml(yamlData);

  return `---\n${yaml}\n---\n${content}`;
}

/**
 * Generate a unique local note ID.
 */
export function generateNoteId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create default metadata for a plain markdown file (no frontmatter).
 */
export function createDefaultMetadata(): NoteMetadata {
  const now = new Date().toISOString();
  return {
    id: generateNoteId(),
    categoryId: null,
    status: NoteStatus.Inbox,
    version: 1,
    deviceId: '',
    createdAt: now,
    updatedAt: now,
    isLocal: true,
    serverId: null,
  };
}

/**
 * Extract note ID from a filename.
 * @param filename The filename (e.g., "abc123.md")
 * @returns The note ID (e.g., "abc123")
 */
export function extractIdFromFilename(filename: string): string | null {
  const normalizedFilename = filename.replace(/\\/g, '/');

  if (normalizedFilename.includes('/') || !normalizedFilename.endsWith('.md')) {
    return null;
  }

  const noteId = normalizeNoteId(normalizedFilename.slice(0, -3));
  return noteId;
}

function parsePath(value: string): ParsedPathInfo {
  const normalized = value.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^[A-Za-z]:/);
  const hasDrive = Boolean(driveMatch);
  const hasLeadingSlash = normalized.startsWith('/');
  const isAbsolute = hasDrive || hasLeadingSlash;

  let root = '';
  let remainder = normalized;

  if (hasDrive) {
    root = driveMatch![0];
    remainder = normalized.slice(root.length);
    if (remainder.startsWith('/')) {
      remainder = remainder.slice(1);
    }
  } else if (hasLeadingSlash) {
    remainder = normalized.slice(1);
  }

  const segments = remainder
    .split('/')
    .filter(Boolean)
    .reduce<string[]>((resolved, segment) => {
      if (segment === '.') {
        return resolved;
      }

      if (segment === '..') {
        if (resolved.length > 0) {
          resolved.pop();
        } else if (!isAbsolute) {
          resolved.push('..');
        }
        return resolved;
      }

      resolved.push(segment);
      return resolved;
    }, []);

  return {
    root,
    segments,
    isAbsolute,
  };
}

function normalizePath(root: string, segments: string[], separator: string): string {
  const cleanedSegments = [...segments];
  while (cleanedSegments.length > 0 && cleanedSegments[0] === '..') {
    cleanedSegments.shift();
  }

  if (root) {
    return cleanedSegments.length > 0
      ? `${root}${separator}${cleanedSegments.join(separator)}`
      : root;
  }

  return separator + cleanedSegments.join(separator);
}

function resolveRelativeSegments(baseSegments: string[], relativePath: string): string[] {
  const resolvedSegments = [...baseSegments];
  const normalizedRelative = relativePath.replace(/\\/g, '/');

  for (const segment of normalizedRelative.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (resolvedSegments.length > 0) {
        resolvedSegments.pop();
      }
      continue;
    }

    resolvedSegments.push(segment);
  }

  return resolvedSegments;
}
