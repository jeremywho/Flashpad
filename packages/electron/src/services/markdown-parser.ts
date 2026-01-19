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

    const metadata: NoteMetadata = {
      id: String(data.id || ''),
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
 * Extract note ID from a filename.
 * @param filename The filename (e.g., "abc123.md")
 * @returns The note ID (e.g., "abc123")
 */
export function extractIdFromFilename(filename: string): string {
  return filename.replace(/\.md$/, '');
}
