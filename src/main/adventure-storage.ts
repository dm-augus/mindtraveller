import * as fs from 'node:fs/promises';
import path from 'node:path';
import { isAdventure } from '../shared/adventure-validation';
import type { Adventure } from '../shared/types';

export interface AdventureFileOps {
  mkdir(filePath: string, options: { recursive: true }): Promise<string | undefined>;
  readFile(filePath: string, encoding: 'utf8'): Promise<string>;
  writeFile(filePath: string, data: string, encoding: 'utf8'): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(filePath: string): Promise<void>;
}

type StoredDocument =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'discarded' }
  | { kind: 'valid'; text: string; adventure: Adventure };

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function parseDocument(text: string): Adventure | null {
  try {
    const value: unknown = JSON.parse(text);
    return isAdventure(value) ? value : null;
  } catch {
    return null;
  }
}

function isDiscardMarker(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object'
      && value !== null
      && !Array.isArray(value)
      && Object.keys(value).length === 2
      && 'schemaVersion' in value && value.schemaVersion === 1
      && 'kind' in value && value.kind === 'discarded';
  } catch {
    return false;
  }
}

function serializeAdventure(adventure: Adventure): string {
  const text = JSON.stringify(adventure);
  if (typeof text !== 'string' || parseDocument(text) === null) {
    throw new TypeError('Adventure does not match save schema version 1.');
  }
  return `${text}\n`;
}

export class AdventureStore {
  readonly directory: string;
  readonly activePath: string;
  readonly backupPath: string;
  private readonly temporaryPath: string;
  private readonly temporaryBackupPath: string;
  private writes: Promise<void> = Promise.resolve();

  constructor(userDataPath: string, private readonly files: AdventureFileOps = fs) {
    if (!path.isAbsolute(userDataPath)) throw new TypeError('userData path must be absolute.');
    this.directory = path.join(userDataPath, 'mindtraveller');
    this.activePath = path.join(this.directory, 'adventure.json');
    this.backupPath = path.join(this.directory, 'adventure.last-good.json');
    this.temporaryPath = `${this.activePath}.tmp`;
    this.temporaryBackupPath = `${this.backupPath}.tmp`;
  }

  private async readDocument(filePath: string): Promise<StoredDocument> {
    let text: string;
    try {
      text = await this.files.readFile(filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return { kind: 'missing' };
      throw error;
    }
    if (isDiscardMarker(text)) return { kind: 'discarded' };
    const adventure = parseDocument(text);
    return adventure === null ? { kind: 'invalid' } : { kind: 'valid', text, adventure };
  }

  private async readVisibleAdventure(): Promise<Adventure | null> {
    const active = await this.readDocument(this.activePath);
    if (active.kind === 'valid') return active.adventure;
    if (active.kind === 'discarded') return null;

    const backup = await this.readDocument(this.backupPath);
    if (backup.kind === 'valid') return backup.adventure;
    if (active.kind === 'missing' && backup.kind === 'missing') return null;
    throw new Error('No valid adventure save or last-known-good backup is available.');
  }

  async load(): Promise<Adventure | null> {
    await this.writes.catch(() => undefined);
    return this.readVisibleAdventure();
  }

  async save(adventure: Adventure): Promise<void> {
    // Serialize at submission time so queued saves cannot observe later mutations.
    const text = serializeAdventure(adventure);
    const write = this.writes.catch(() => undefined).then(() => this.writeDocument(text));
    this.writes = write;
    await write;
  }

  async discard(expectedAdventureId: string): Promise<void> {
    if (typeof expectedAdventureId !== 'string' || !expectedAdventureId.trim()) {
      throw new TypeError('An adventure ID is required.');
    }
    const write = this.writes.catch(() => undefined).then(async () => {
      const visible = await this.readVisibleAdventure();
      if (visible?.id !== expectedAdventureId) throw new Error('The saved adventure changed.');

      await this.files.mkdir(this.directory, { recursive: true });
      await this.files.writeFile(
        this.temporaryPath,
        `${JSON.stringify({ schemaVersion: 1, kind: 'discarded' })}\n`,
        'utf8'
      );
      await this.files.rename(this.temporaryPath, this.activePath);

      // The marker prevents restoration even if backup cleanup is interrupted.
      try {
        await this.files.unlink(this.backupPath);
      } catch {
        // The next save removes any stale backup before replacing the marker.
      }
    });
    this.writes = write;
    await write;
  }

  private async removeBackupIfPresent(): Promise<void> {
    try {
      await this.files.unlink(this.backupPath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  private async writeDocument(text: string): Promise<void> {
    await this.files.mkdir(this.directory, { recursive: true });
    await this.files.writeFile(this.temporaryPath, text, 'utf8');

    const current = await this.readDocument(this.activePath);
    if (current.kind === 'valid') {
      await this.files.writeFile(this.temporaryBackupPath, current.text, 'utf8');
      await this.files.rename(this.temporaryBackupPath, this.backupPath);
    } else if (current.kind === 'discarded') {
      await this.removeBackupIfPresent();
    }

    await this.files.rename(this.temporaryPath, this.activePath);
  }
}
