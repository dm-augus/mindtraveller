import { storyLanguageInstruction } from '../../shared/story-language';
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
const CONTINUATION_INSTRUCTION = 'The choice field is the current player action to resolve now. In context events, each decision happens AFTER its accompanying narrative; do not replay an earlier decision. Continue AFTER the latest scene by narrating the consequences of the current action. Return a new set of choices for the resulting situation, not the previous scene\'s options or the action just selected. A failed action may leave an obstacle unresolved, but its consequences and next options must reflect the attempt.';
const STATE_INSTRUCTION = 'Return storyState as {"location":string|null,"situation":string,"currentFocus":string|null}. Keep these fields brief, factual, and consistent with the END of the new narrative. Preserve the known location until the character moves. Set currentFocus to the immediate goal pursued by the selected action; use null only if it cannot be inferred. Do not treat a pending action from context as already completed.';
const COHERENCE_INSTRUCTION = 'Use context.mainObjective as the original adventure goal and context.storyState as the latest accepted situation. Keep leads and choices connected to that goal unless the player chooses a detour, completes it, or abandons it; reflect that change in currentFocus and situation without rewriting the original goal. Preserve established facts. Resolve the selected action before offering choices: success accomplishes that action, failure establishes a consequence or alternative. Do not merely prepare to act again, repeat a previous narrative, or undo an already successful action.';

/** Production context is serialized JSON; plain-text contexts remain supported for adapters. */
export function structuredContext(context: string): unknown {
  try { return JSON.parse(context); } catch { return context; }
}

export function openingMessages(request: OpeningRequest): ProviderMessage[] {
  return [
    {
      role: 'system',
      content: `${storyLanguageInstruction(request.language)} You are the Mindtraveller narrator. Follow these rules:\n${request.rules}\n${JSON_INSTRUCTION} Return premise, mainObjective (a brief original adventure goal), narrative, and choices with unique id and text fields. ${STATE_INSTRUCTION} Never invent a die roll.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        language: request.language, operation: 'opening', theme: request.theme, character: request.character,
        paragraphTarget: request.paragraphTarget, choiceTarget: request.choiceTarget
      })
    }
  ];
}

export function assessmentMessages(request: ActionAssessmentRequest): ProviderMessage[] {
  return [
    {
      role: 'system',
      content: `${storyLanguageInstruction(request.language)} ${JSON_INSTRUCTION} Judge whether the selected action is uncertain. Ordinary travel, leaving a house, or speaking without an established obstacle needs no roll. For a trivial or guaranteed action, return kind="no-check", narrative, choices with unique id/text, and storyState. For an uncertain action, return ONLY {"kind":"check","difficulty":"...","attribute":"..."}. Difficulty must be one of ${Object.keys(DIFFICULTY_BASE_THRESHOLDS).join(', ')}. Attribute must be one of ${ATTRIBUTE_NAMES.join(', ')}. Choose by the action: Dexterity for climbing/agility, Intelligence for reasoning/clues, Strength for force, Charisma for persuasion, Endurance for resilience, Luck for chance. Do not roll dice or narrate a check result. For a no-check continuation, complete the selected action in this response. Ordinary travel reaches the destination; a conversation provides a reply or information. Do not split a guaranteed action into repeated preparation scenes. ${CONTINUATION_INSTRUCTION} ${COHERENCE_INSTRUCTION} ${STATE_INSTRUCTION}`
    },
    {
      role: 'user',
      content: JSON.stringify({
        language: request.language, operation: 'assessment', context: structuredContext(request.context), choice: request.choice,
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
      content: `${storyLanguageInstruction(request.language)} ${JSON_INSTRUCTION} The application has already rolled and resolved the check. Respect its result exactly. Return outcome, narrative, choices with unique id and text fields, and storyState. Do not change or reroll the result. ${CONTINUATION_INSTRUCTION} ${COHERENCE_INSTRUCTION} ${STATE_INSTRUCTION}`
    },
    {
      role: 'user',
      content: JSON.stringify({
        language: request.language, operation: 'checked-narration', context: structuredContext(request.context),
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
      content: `${storyLanguageInstruction(request.language)} ${JSON_INSTRUCTION} Summarize the supplied story context. Preserve significant choices, check outcomes, characters, relationships, world facts, and unresolved goals. Treat mainObjective and storyState as supplied memory; do not rewrite them or infer completed actions from pending choices. When updating a prior summary, retain still-relevant facts and unresolved threads; resolve a thread only when the source events establish its resolution. Return text as a string, and keyFacts and unresolvedThreads as arrays of strings.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        language: request.language, operation: 'summary', kind: request.kind,
        chapterNumber: request.kind === 'chapter' ? request.chapterNumber : null,
        context: structuredContext(request.context)
      })
    }
  ];
}
