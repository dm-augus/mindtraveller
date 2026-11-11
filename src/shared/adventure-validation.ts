import { createCheckRecord, type CheckSelection } from './action-rules';
import { validateCharacterSetup } from './character-rules';
import { ATTRIBUTE_NAMES } from './rules';
import type { Adventure } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isChoice(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['id', 'text'])
    && isText(value.id)
    && isText(value.text);
}

function isCheckRecord(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'difficulty', 'attribute', 'attributeValue', 'baseThreshold', 'threshold', 'roll', 'outcome'
  ])) return false;
  try {
    const expected = createCheckRecord({
      difficulty: value.difficulty,
      attribute: value.attribute,
      attributeValue: value.attributeValue
    } as CheckSelection, value.roll as number);
    return Object.entries(expected).every(([key, field]) => value[key] === field);
  } catch {
    return false;
  }
}

function isSegment(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, [
      'id', 'chapterNumber', 'narrative', 'choices', 'selectedChoiceId', 'check', 'createdAt'
    ])
    && isText(value.id)
    && isPositiveInteger(value.chapterNumber)
    && isText(value.narrative)
    && Array.isArray(value.choices)
    && value.choices.every(isChoice)
    && (value.selectedChoiceId === null || isText(value.selectedChoiceId))
    && (value.check === null || isCheckRecord(value.check))
    && isText(value.createdAt);
}

function isChapterSummary(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['chapterNumber', 'throughSegmentId', 'text'])
    && isPositiveInteger(value.chapterNumber)
    && isText(value.throughSegmentId)
    && isText(value.text);
}

function isPendingChoice(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ['turnId', 'choiceId', 'choiceText'])
    && isText(value.turnId)
    && isText(value.choiceId)
    && isText(value.choiceText);
}

function isPhase(value: unknown): boolean {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'ready':
      return hasOnlyKeys(value, ['kind']);
    case 'pending-opening':
      return hasOnlyKeys(value, ['kind', 'turnId']) && isText(value.turnId);
    case 'pending-assessment':
      return hasOnlyKeys(value, ['kind', 'choice']) && isPendingChoice(value.choice);
    case 'pending-narration':
      return hasOnlyKeys(value, ['kind', 'choice', 'check'])
        && isPendingChoice(value.choice) && isCheckRecord(value.check);
    case 'pending-summary':
      return hasOnlyKeys(value, ['kind', 'turnId', 'chapterNumber'])
        && isText(value.turnId) && isPositiveInteger(value.chapterNumber);
    default:
      return false;
  }
}

export function isAdventure(value: unknown): value is Adventure {
  if (!isRecord(value)) return false;
  const character = value.character;
  if (!isRecord(character) || !hasOnlyKeys(character, [
    'name', 'gender', 'nature', 'allocationMethod', 'attributes'
  ])) return false;
  if (!isRecord(character.attributes) || !hasOnlyKeys(character.attributes, ATTRIBUTE_NAMES)) return false;

  const validShape = hasOnlyKeys(value, [
    'schemaVersion', 'id', 'theme', 'character', 'premise', 'segments',
    'chapterSummaries', 'globalSummary', 'phase', 'updatedAt'
  ])
    && value.schemaVersion === 1
    && isText(value.id)
    && validateCharacterSetup({ theme: value.theme, character: value.character }).valid
    && (value.premise === null || typeof value.premise === 'string')
    && Array.isArray(value.segments)
    && value.segments.every(isSegment)
    && Array.isArray(value.chapterSummaries)
    && value.chapterSummaries.every(isChapterSummary)
    && typeof value.globalSummary === 'string'
    && isPhase(value.phase)
    && isText(value.updatedAt);
  if (!validShape) return false;

  const phase = value.phase as Record<string, unknown>;
  if (phase.kind === 'pending-assessment' || phase.kind === 'pending-narration') {
    const segments = value.segments as Array<Record<string, unknown>>;
    const latest = segments.at(-1);
    const choice = phase.choice as Record<string, unknown>;
    if (!latest || latest.selectedChoiceId !== choice.choiceId) return false;
    if (!(latest.choices as Array<Record<string, unknown>>).some(
      (available) => available.id === choice.choiceId && available.text === choice.choiceText
    )) return false;
  }
  return true;
}
