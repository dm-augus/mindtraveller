import type { StoryState } from './types';

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isStoryState(value: unknown): value is StoryState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return Object.keys(state).length === 3
    && (state.location === null || isText(state.location))
    && isText(state.situation)
    && (state.currentFocus === null || isText(state.currentFocus));
}

/** Fill only absent legacy fields. Explicit invalid values must reach validation. */
export function normalizeStoryMemory(value: Record<string, unknown>): void {
  const segments = Array.isArray(value.segments) ? value.segments : [];
  const first: unknown = segments[0];
  const latest: unknown = segments.at(-1);
  const narrative = (segment: unknown): string | null => {
    if (typeof segment !== 'object' || segment === null || !('narrative' in segment)) return null;
    return isText(segment.narrative) ? segment.narrative : null;
  };
  if (!Object.hasOwn(value, 'mainObjective')) {
    value.mainObjective = isText(value.premise) ? value.premise : narrative(first);
  }
  if (!Object.hasOwn(value, 'storyState')) {
    const situation = narrative(latest);
    value.storyState = situation === null ? null : { location: null, situation, currentFocus: null };
  }
}
