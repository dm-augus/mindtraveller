import {
  parseSummaryResponse,
  type StoryProvider,
  type SummaryResponse
} from '../shared/provider-contract';
import { GAME_RULES_TEXT } from '../shared/rules-reference';
import type { Adventure, ChapterSummary, StorySegment } from '../shared/types';
import { createStoryConfiguration, type StoryConfiguration } from './story-config';
import { estimateContextTokens, selectedChoice, StoryContextBudgetError, StoryContextBuilder } from './story-context';

interface ChapterSource {
  chapterNumber: number;
  segments: StorySegment[];
  unsummarized: StorySegment[];
  previousSummary: ChapterSummary | undefined;
}

function chapterSources(adventure: Adventure): ChapterSource[] {
  const chapters = new Map<number, StorySegment[]>();
  for (const segment of adventure.segments) {
    const segments = chapters.get(segment.chapterNumber) ?? [];
    segments.push(segment);
    chapters.set(segment.chapterNumber, segments);
  }
  return [...chapters].map(([chapterNumber, segments]) => {
    const previousSummary = adventure.chapterSummaries.find((summary) => summary.chapterNumber === chapterNumber);
    const throughIndex = previousSummary
      ? segments.findIndex((segment) => segment.id === previousSummary.throughSegmentId) : -1;
    if (previousSummary && throughIndex === -1) {
      throw new TypeError('A chapter summary source boundary is missing from the adventure.');
    }
    return { chapterNumber, segments, unsummarized: segments.slice(throughIndex + 1), previousSummary };
  });
}

function sourceEvents(segments: StorySegment[]) {
  return segments.map((segment) => ({
    segmentId: segment.id,
    chapterNumber: segment.chapterNumber,
    narrative: segment.narrative,
    decision: selectedChoice(segment),
    check: segment.check
  }));
}

function summaryText(summary: SummaryResponse): string {
  return [
    summary.text,
    ...(summary.keyFacts.length ? [`Key facts:\n${summary.keyFacts.map((fact) => `- ${fact}`).join('\n')}`] : []),
    ...(summary.unresolvedThreads.length
      ? [`Unresolved threads:\n${summary.unresolvedThreads.map((thread) => `- ${thread}`).join('\n')}`] : [])
  ].join('\n\n');
}

export class StorySummarizer {
  readonly configuration: Readonly<StoryConfiguration>;

  constructor(overrides: Partial<StoryConfiguration> = {}) {
    this.configuration = createStoryConfiguration(overrides);
  }

  nextChapterNumber(adventure: Adventure): number {
    const latest = adventure.segments.at(-1);
    if (!latest) return 1;
    const count = adventure.segments.filter((segment) => segment.chapterNumber === latest.chapterNumber).length;
    return count >= this.configuration.chapterLength ? latest.chapterNumber + 1 : latest.chapterNumber;
  }

  chaptersDue(adventure: Adventure): number[] {
    if (adventure.phase.kind !== 'ready' && adventure.phase.kind !== 'pending-summary') {
      throw new TypeError('Summarization requires completed story progress.');
    }
    const sources = chapterSources(adventure).filter((source) => source.unsummarized.length > 0);
    if (adventure.phase.kind === 'pending-summary') {
      const chapterNumber = adventure.phase.chapterNumber;
      if (!sources.some((source) => source.chapterNumber === chapterNumber)) {
        throw new TypeError('The pending summary has no unsummarized source events.');
      }
      return [chapterNumber];
    }
    const globalThresholdReached = sources.length > 0
      && estimateContextTokens(JSON.stringify(sources.flatMap((source) => sourceEvents(source.unsummarized))))
        >= this.configuration.globalSummaryThresholdTokens;
    const latestChapter = adventure.segments.at(-1)?.chapterNumber;
    return sources.filter((source) => source.chapterNumber !== latestChapter
      || source.segments.length >= this.configuration.chapterLength
      || estimateContextTokens(JSON.stringify(sourceEvents(source.unsummarized)))
        >= this.configuration.chapterSummaryThresholdTokens
      || globalThresholdReached).map((source) => source.chapterNumber);
  }

  /** Stage both memory levels in a detached document; the caller saves this document once.
   * Source events remain present in both the original and staged adventure, including on failure.
   */
  async update(
    adventure: Adventure,
    provider: Pick<StoryProvider, 'summarize'>,
    modelId: string
  ): Promise<Adventure> {
    const staged = structuredClone(adventure);
    const due = this.chaptersDue(staged);
    if (!due.length) return staged;

    const sources = chapterSources(staged);
    for (const chapterNumber of due) {
      const source = sources.find((chapter) => chapter.chapterNumber === chapterNumber)!;
      const first = staged.segments.findIndex((segment) => segment.id === source.unsummarized[0].id);
      const precedingSegment = staged.segments[first - 1];
      const context = JSON.stringify({
        rules: GAME_RULES_TEXT,
        theme: staged.theme,
        character: staged.character,
        premise: staged.premise,
        globalSummary: staged.globalSummary,
        previousChapterSummary: source.previousSummary?.text ?? '',
        // A chapter's first check resolves a decision offered by the preceding segment.
        precedingDecision: precedingSegment ? selectedChoice(precedingSegment) : null,
        sourceEvents: sourceEvents(source.unsummarized)
      });
      const estimatedTokens = estimateContextTokens(context);
      if (estimatedTokens > this.configuration.contextBudgetTokens) {
        throw new StoryContextBudgetError(estimatedTokens, this.configuration.contextBudgetTokens);
      }
      const summary = parseSummaryResponse(await provider.summarize({
        modelId, kind: 'chapter', chapterNumber, context
      }));
      const next: ChapterSummary = {
        chapterNumber,
        throughSegmentId: source.unsummarized.at(-1)!.id,
        text: summaryText(summary)
      };
      const existing = staged.chapterSummaries.findIndex((chapter) => chapter.chapterNumber === chapterNumber);
      if (existing === -1) staged.chapterSummaries.push(next);
      else staged.chapterSummaries[existing] = next;
    }

    const global = parseSummaryResponse(await provider.summarize({
      modelId, kind: 'global', context: new StoryContextBuilder(this.configuration).build(staged)
    }));
    staged.globalSummary = summaryText(global);
    staged.updatedAt = new Date().toISOString();
    return staged;
  }
}
