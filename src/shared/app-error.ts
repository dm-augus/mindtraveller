import { formatMessage, type MessageKey, type MessageParams, type MessageRef } from './i18n';
import { ProviderError } from './provider-error';

export class AppError extends Error {
  constructor(readonly messageKey: MessageKey, readonly params?: MessageParams) {
    super(formatMessage('en', { key: messageKey, params }));
    this.name = 'AppError';
  }
}

export class AppTypeError extends TypeError {
  constructor(readonly messageKey: MessageKey, readonly params?: MessageParams) {
    super(formatMessage('en', { key: messageKey, params }));
    this.name = 'AppTypeError';
  }
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: MessageRef };

export async function ipcResult<T>(action: () => T | Promise<T>): Promise<IpcResult<T>> {
  try { return { ok: true, value: await action() }; }
  catch (error) {
    if (error instanceof AppError || error instanceof AppTypeError) {
      return { ok: false, error: { key: error.messageKey, params: error.params } };
    }
    if (error instanceof ProviderError) {
      return { ok: false, error: { key: `error.provider.${error.code}`,
        params: { provider: error.provider === 'openai' ? 'OpenAI' : 'Ollama' } } };
    }
    if (error instanceof Error && 'code' in error && error.code === 'context-budget-exceeded') {
      return { ok: false, error: { key: 'error.context' } };
    }
    return { ok: false, error: { key: 'error.unknown' } };
  }
}
