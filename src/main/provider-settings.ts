import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { ProviderConfiguration, ProviderSettings } from '../shared/types';

export interface SecretProtector {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

type SettingsFileOps = Pick<typeof fs, 'mkdir' | 'readFile' | 'writeFile' | 'rename'>;

const DEFAULT_CONFIGURATION: ProviderConfiguration = {
  activeProvider: 'ollama',
  ollama: { serverAddress: 'http://127.0.0.1:11434', modelId: null },
  openai: { modelId: null }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function modelId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Select a valid model.');
  return value.trim();
}

function parseConfiguration(value: unknown): ProviderConfiguration {
  if (!isRecord(value) || !isRecord(value.ollama) || !isRecord(value.openai)) {
    throw new TypeError('Invalid provider settings.');
  }
  if (value.activeProvider !== 'ollama' && value.activeProvider !== 'openai') {
    throw new TypeError('Select Ollama or OpenAI.');
  }
  if (typeof value.ollama.serverAddress !== 'string' || !value.ollama.serverAddress.trim()) {
    throw new TypeError('Enter an Ollama server address.');
  }
  return {
    activeProvider: value.activeProvider,
    ollama: { serverAddress: value.ollama.serverAddress.trim(), modelId: modelId(value.ollama.modelId) },
    openai: { modelId: modelId(value.openai.modelId) }
  };
}

export class ProviderSettingsStore {
  readonly directory: string;
  readonly settingsPath: string;
  readonly encryptedKeyPath: string;
  private readonly temporarySettingsPath: string;
  private readonly temporaryKeyPath: string;
  private sessionKey: string | null = null;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    userDataPath: string,
    private readonly protector: SecretProtector,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly files: SettingsFileOps = fs
  ) {
    if (!path.isAbsolute(userDataPath)) throw new TypeError('userData path must be absolute.');
    this.directory = path.join(userDataPath, 'mindtraveller');
    this.settingsPath = path.join(this.directory, 'provider-settings.json');
    this.encryptedKeyPath = path.join(this.directory, 'openai-key.bin');
    this.temporarySettingsPath = `${this.settingsPath}.tmp`;
    this.temporaryKeyPath = `${this.encryptedKeyPath}.tmp`;
  }

  private async secureStorageAvailable(): Promise<boolean> {
    if (this.platform !== 'win32') return false;
    try {
      return await this.protector.isAsyncEncryptionAvailable();
    } catch {
      return false;
    }
  }

  private enqueue(write: () => Promise<void>): Promise<void> {
    const next = this.writes.catch(() => undefined).then(write);
    this.writes = next;
    return next;
  }

  private async readConfiguration(): Promise<ProviderConfiguration> {
    let text: string;
    try {
      text = await this.files.readFile(this.settingsPath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return DEFAULT_CONFIGURATION;
      throw new Error('Unable to read provider settings.');
    }
    try {
      const document: unknown = JSON.parse(text);
      if (!isRecord(document) || document.schemaVersion !== 1) throw new Error();
      return parseConfiguration(document);
    } catch {
      throw new Error('Provider settings are invalid or unsupported.');
    }
  }

  private async hasSavedKey(): Promise<boolean> {
    try {
      await this.files.readFile(this.encryptedKeyPath);
      return true;
    } catch (error) {
      if (isMissingFile(error)) return false;
      throw new Error('Unable to read saved key status.');
    }
  }

  async getPublicSettings(): Promise<ProviderSettings> {
    await this.writes.catch(() => undefined);
    const configuration = await this.readConfiguration();
    return {
      ...configuration,
      ollama: { ...configuration.ollama },
      openai: { ...configuration.openai, hasSavedKey: await this.hasSavedKey() }
    };
  }

  async saveConfiguration(input: unknown): Promise<ProviderSettings> {
    const configuration = parseConfiguration(input);
    await this.enqueue(async () => {
      await this.files.mkdir(this.directory, { recursive: true });
      await this.files.writeFile(
        this.temporarySettingsPath,
        `${JSON.stringify({ schemaVersion: 1, ...configuration })}\n`,
        'utf8'
      );
      await this.files.rename(this.temporarySettingsPath, this.settingsPath);
    });
    return this.getPublicSettings();
  }

  async setOpenAiKey(key: unknown, persist: unknown): Promise<{ persisted: boolean }> {
    if (typeof key !== 'string' || !key.trim() || typeof persist !== 'boolean') {
      throw new TypeError('Enter a valid OpenAI key and storage choice.');
    }
    const sessionKey = key.trim();
    this.sessionKey = sessionKey;
    if (!persist || !(await this.secureStorageAvailable())) return { persisted: false };

    await this.enqueue(async () => {
      try {
        const encrypted = await this.protector.encryptStringAsync(sessionKey);
        if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) throw new Error();
        await this.files.mkdir(this.directory, { recursive: true });
        await this.files.writeFile(this.temporaryKeyPath, encrypted);
        await this.files.rename(this.temporaryKeyPath, this.encryptedKeyPath);
      } catch {
        throw new Error('Unable to save the OpenAI key securely.');
      }
    });
    return { persisted: true };
  }

  async getOpenAiKeyForRequest(): Promise<string | null> {
    await this.writes.catch(() => undefined);
    if (this.sessionKey !== null) return this.sessionKey;
    if (!(await this.secureStorageAvailable())) return null;

    let encrypted: Buffer;
    try {
      encrypted = await this.files.readFile(this.encryptedKeyPath);
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw new Error('Unable to read the saved OpenAI key.');
    }
    try {
      let decrypted = await this.protector.decryptStringAsync(encrypted);
      if (decrypted.shouldReEncrypt) decrypted = await this.protector.decryptStringAsync(encrypted);
      return decrypted.result;
    } catch {
      throw new Error('Unable to unlock the saved OpenAI key.');
    }
  }
}
