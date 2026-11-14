import type { StoryLanguage } from './types';

export const STORY_LANGUAGES = ['en', 'pt-BR'] as const;
export const LANGUAGE_LABELS: Record<StoryLanguage, string> = { en: 'English', 'pt-BR': 'Português' };
export function isStoryLanguage(value: unknown): value is StoryLanguage {
  return value === 'en' || value === 'pt-BR';
}

export function storyLanguageInstruction(language: StoryLanguage = 'en'): string {
  if (!isStoryLanguage(language)) throw new TypeError('Unsupported story language.');
  const name = language === 'pt-BR' ? 'Brazilian Portuguese' : 'English';
  return `Write all generated premise, narrative, choice text, summary text, key facts, and unresolved threads in ${name}. Keep JSON field names, identifiers, difficulty classes, attribute names, and outcome enum values in their existing machine-readable form. Do not translate player names or rewrite existing history.`;
}
