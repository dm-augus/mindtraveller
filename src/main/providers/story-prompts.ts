import { ATTRIBUTE_NAMES, DIFFICULTY_BASE_THRESHOLDS } from '../../shared/rules';
import type {
  ActionAssessmentRequest,
  CheckedNarrationRequest,
  OpeningRequest,
  SummaryRequest
} from '../../shared/provider-contract';

export interface ProviderMessage {
  role: 'system' | 'user';
  content: string;
}

const JSON_INSTRUCTION = 'Return only one JSON object. Do not wrap it in Markdown.';

export function openingMessages(request: OpeningRequest): ProviderMessage[] {
  return [
    {
      role: 'system',
      content: `You are the Mindtraveller narrator. Follow these rules:\n${request.rules}\n${JSON_INSTRUCTION} Return premise, narrative, and choices with unique id and text fields. Never invent a die roll.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        operation: 'opening', theme: request.theme, character: request.character,
        paragraphTarget: request.paragraphTarget, choiceTarget: request.choiceTarget
      })
    }
  ];
}

export function assessmentMessages(request: ActionAssessmentRequest): ProviderMessage[] {
  return [
    {
      role: 'system',
      content: `${JSON_INSTRUCTION} Judge whether the selected action is uncertain. For a trivial or guaranteed action, return {"kind":"no-check","narrative":"...","choices":[{"id":"...","text":"..."}]}. For an uncertain action, return {"kind":"check","difficulty":"...","attribute":"..."}. Difficulty must be one of ${Object.keys(DIFFICULTY_BASE_THRESHOLDS).join(', ')}. Attribute must be one of ${ATTRIBUTE_NAMES.join(', ')}. Do not roll dice or narrate a check result.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        operation: 'assessment', context: request.context, choice: request.choice,
        attributes: request.attributes, paragraphTarget: request.paragraphTarget,
        choiceTarget: request.choiceTarget
      })
    }
  ];
}

export function checkedNarrationMessages(request: CheckedNarrationRequest): ProviderMessage[] {
  return [
    {
      role: 'system',
      content: `${JSON_INSTRUCTION} The application has already rolled and resolved the check. Respect its result exactly. Return outcome, narrative, and choices with unique id and text fields. Do not change or reroll the result.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        operation: 'checked-narration', context: request.context,
        choice: request.choice, check: request.check,
        paragraphTarget: request.paragraphTarget, choiceTarget: request.choiceTarget
      })
    }
  ];
}

export function summaryMessages(request: SummaryRequest): ProviderMessage[] {
  return [
    {
      role: 'system',
      content: `${JSON_INSTRUCTION} Summarize the supplied story context. Preserve significant choices, check outcomes, characters, relationships, world facts, and unresolved goals. When updating a prior summary, retain still-relevant facts and unresolved threads; resolve a thread only when the source events establish its resolution. Return text as a string, and keyFacts and unresolvedThreads as arrays of strings.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        operation: 'summary', kind: request.kind,
        chapterNumber: request.kind === 'chapter' ? request.chapterNumber : null,
        context: request.context
      })
    }
  ];
}
