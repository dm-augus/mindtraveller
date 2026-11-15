import { en } from './locales/en';
import { ptBR } from './locales/pt-BR';
import type { InterfaceLanguage } from './types';

export type MessageKey = keyof typeof en;
export type MessageParams = Readonly<Record<string, string | number>>;
export interface MessageRef { key: MessageKey; params?: MessageParams }
type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;
export type ParamsFor<K extends MessageKey> = Record<Placeholders<(typeof en)[K]>, string | number>;
export type Translator = <K extends MessageKey>(key: K, params?: ParamsFor<K>) => string;
export const catalogs = { en, 'pt-BR': ptBR };

export function isMessageKey(key: unknown): key is MessageKey {
  return typeof key === 'string' && Object.hasOwn(en, key);
}

export function label(locale: InterfaceLanguage, value: string): string {
  const key = `label.${value}`;
  return isMessageKey(key) ? catalogs[locale][key] : value;
}

export function translate<K extends MessageKey>(locale: InterfaceLanguage, key: K, params?: ParamsFor<K>): string {
  return formatMessage(locale, { key, params });
}

export function formatMessage(locale: InterfaceLanguage, message: MessageRef): string {
  return catalogs[locale][message.key].replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = message.params?.[name];
    if (value === undefined) return placeholder;
    return ['attribute', 'method', 'nature'].includes(name) ? label(locale, String(value)) : String(value);
  });
}

/** Only structured application errors are displayed, never arbitrary error messages. */
export function errorText(locale: InterfaceLanguage, failure: unknown): string {
  let candidate: unknown = failure;
  if (failure instanceof Error) {
    if ('messageKey' in failure) candidate = { key: failure.messageKey, ...('params' in failure ? { params: failure.params } : {}) };
    else {
      const marker = '__MINDTRAVELLER_ERROR__';
      const start = failure.message.indexOf(marker);
      if (start >= 0) {
        try { candidate = JSON.parse(failure.message.slice(start + marker.length)); } catch { candidate = null; }
      }
    }
  }
  if (isMessageKey(candidate)) return translate(locale, candidate);
  if (typeof candidate === 'object' && candidate !== null && 'key' in candidate && isMessageKey(candidate.key)) {
    const params = 'params' in candidate && typeof candidate.params === 'object' && candidate.params !== null
      ? Object.fromEntries(Object.entries(candidate.params).filter(([, value]) => typeof value === 'string' || typeof value === 'number')) : undefined;
    return formatMessage(locale, { key: candidate.key, params });
  }
  return translate(locale, 'error.unknown');
}
