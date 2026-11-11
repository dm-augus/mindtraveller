export interface StoryConfiguration {
  paragraphTarget: number;
  choiceTarget: number;
  /** Maximum number of narrative segments in a chapter. */
  chapterLength: number;
  /** Number of detailed narrative segments included in story context. */
  recentEventCount: number;
  /** Estimated token budget for serialized story context, before provider overhead. */
  contextBudgetTokens: number;
  /** Unsummarized chapter detail can trigger a summary before chapterLength. */
  chapterSummaryThresholdTokens: number;
  /** Accumulated unsummarized detail can trigger a global update between chapter boundaries. */
  globalSummaryThresholdTokens: number;
}

// Internal settings; independent of provider settings and the adventure save format.
export const DEFAULT_STORY_CONFIGURATION: Readonly<StoryConfiguration> = Object.freeze({
  paragraphTarget: 3,
  choiceTarget: 3,
  chapterLength: 10,
  recentEventCount: 6,
  contextBudgetTokens: 8_000,
  chapterSummaryThresholdTokens: 4_000,
  globalSummaryThresholdTokens: 6_000
});

export function createStoryConfiguration(
  overrides: Partial<StoryConfiguration> = {}
): Readonly<StoryConfiguration> {
  for (const key of Object.keys(overrides)) {
    if (!Object.hasOwn(DEFAULT_STORY_CONFIGURATION, key)) {
      throw new TypeError(`Unknown story configuration setting: ${key}.`);
    }
  }
  const configuration = { ...DEFAULT_STORY_CONFIGURATION, ...overrides };
  for (const [key, value] of Object.entries(configuration)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${key} must be a positive safe integer.`);
    }
  }
  return Object.freeze(configuration);
}
