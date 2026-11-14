import type { StoryLanguage } from './types';

export const STORY_LANGUAGES = ['en', 'pt-BR'] as const;
export const LANGUAGE_LABELS: Record<StoryLanguage, string> = { en: 'English', 'pt-BR': 'Português' };
export function isStoryLanguage(value: unknown): value is StoryLanguage {
  return value === 'en' || value === 'pt-BR';
}
