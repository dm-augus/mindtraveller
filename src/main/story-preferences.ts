import { AppError, AppTypeError } from '../shared/app-error';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { StoryPreferences } from '../shared/types';
import { isStoryLanguage } from '../shared/story-language';
import type { AdventureFileOps } from './adventure-storage';

const DEFAULTS: StoryPreferences = { defaultStoryLanguage: 'en', interfaceLanguage: 'en', autoReadStory: true };

function parsePatch(value: unknown): Partial<StoryPreferences> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !Object.keys(value).length || Object.keys(value).some(key => !Object.hasOwn(DEFAULTS, key))
    || ('defaultStoryLanguage' in value && !isStoryLanguage(value.defaultStoryLanguage))
    || ('interfaceLanguage' in value && !isStoryLanguage(value.interfaceLanguage))
    || ('autoReadStory' in value && typeof value.autoReadStory !== 'boolean')) {
    throw new AppTypeError('error.preferencesInvalid');
  }
  return { ...value };
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
    return this.read();
  }

  private async read(): Promise<StoryPreferences> {
    let text: string;
    try { text = await this.files.readFile(this.preferencesPath, 'utf8'); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return { ...DEFAULTS };
      }
      throw new AppError('error.preferencesRead');
    }
    try {
      const value: unknown = JSON.parse(text);
      if (typeof value !== 'object' || value === null || !('schemaVersion' in value)
        || value.schemaVersion !== 1 || !('defaultStoryLanguage' in value)) throw new Error();
      const { schemaVersion: _version, ...preferences } = value;
      return { ...DEFAULTS, ...parsePatch(preferences) };
    } catch { throw new AppError('error.preferencesCorrupt'); }
  }

  async save(input: unknown): Promise<StoryPreferences> {
    const patch = parsePatch(input);
    const write = this.writes.catch(() => undefined).then(async () => {
      const preferences = { ...await this.read(), ...patch };
      try {
        await this.files.mkdir(path.dirname(this.preferencesPath), { recursive: true });
        await this.files.writeFile(`${this.preferencesPath}.tmp`, `${JSON.stringify({ schemaVersion: 1, ...preferences })}\n`, 'utf8');
        await this.files.rename(`${this.preferencesPath}.tmp`, this.preferencesPath);
      } catch { throw new AppError('error.preferencesSave'); }
      return preferences;
    });
    this.writes = write.then(() => undefined, () => undefined);
    return write;
  }
}
