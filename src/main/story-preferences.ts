import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { StoryPreferences } from '../shared/types';
import { isStoryLanguage } from '../shared/story-language';
import type { AdventureFileOps } from './adventure-storage';

function parsePreferences(value: unknown): StoryPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).length !== 1 || !('defaultStoryLanguage' in value)
    || !isStoryLanguage(value.defaultStoryLanguage)) throw new TypeError('Select English or Português.');
  return { defaultStoryLanguage: value.defaultStoryLanguage };
}

export class StoryPreferencesStore {
  readonly preferencesPath: string;
  private writes: Promise<void> = Promise.resolve();
  constructor(userDataPath: string, private readonly files: Pick<AdventureFileOps, 'mkdir' | 'readFile' | 'writeFile' | 'rename'> = fs) {
    if (!path.isAbsolute(userDataPath)) throw new TypeError('userData path must be absolute.');
    this.preferencesPath = path.join(userDataPath, 'mindtraveller', 'preferences.json');
  }

  async get(): Promise<StoryPreferences> {
    await this.writes.catch(() => undefined);
    let text: string;
    try { text = await this.files.readFile(this.preferencesPath, 'utf8'); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return { defaultStoryLanguage: 'en' };
      }
      throw new Error('Unable to read story language preferences.');
    }
    try {
      const value: unknown = JSON.parse(text);
      if (typeof value !== 'object' || value === null || !('schemaVersion' in value)
        || value.schemaVersion !== 1 || Object.keys(value).length !== 2) throw new Error();
      const { schemaVersion: _version, ...preferences } = value;
      return parsePreferences(preferences);
    } catch { throw new Error('Story language preferences are invalid or unsupported.'); }
  }

  async save(input: unknown): Promise<StoryPreferences> {
    const preferences = parsePreferences(input);
    const write = this.writes.catch(() => undefined).then(async () => {
      try {
        await this.files.mkdir(path.dirname(this.preferencesPath), { recursive: true });
        await this.files.writeFile(`${this.preferencesPath}.tmp`, `${JSON.stringify({ schemaVersion: 1, ...preferences })}\n`, 'utf8');
        await this.files.rename(`${this.preferencesPath}.tmp`, this.preferencesPath);
      } catch { throw new Error('Unable to save story language preferences. Try again.'); }
    });
    this.writes = write;
    await write;
    return preferences;
  }
}
