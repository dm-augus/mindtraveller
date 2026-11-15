import type { Adventure, CheckRecord } from '../shared/types';
import { ATTRIBUTE_NAMES } from '../shared/rules';
import { LANGUAGE_LABELS } from '../shared/story-language';

function checkText(check: CheckRecord): string {
  const modifier = check.attributeValue > 0 ? `+${check.attributeValue}` : String(check.attributeValue);
  return `Check: ${check.difficulty} · ${check.attribute} ${modifier} · D100 ${check.roll} · Threshold ${check.threshold} · ${check.outcome}`;
}

/** Export source history only; never serialize the adventure or its model context wholesale. */
export function formatHistory(adventure: Adventure): string {
  const character = adventure.character;
  const lines = ['# Mindtraveller — Adventure history', '', `Genre: ${adventure.theme}`,
    `Language: ${LANGUAGE_LABELS[adventure.language]}`, '', '## Character', '',
    `Name: ${character.name}`, `Gender: ${character.gender}`, `Nature: ${character.nature}`,
    `Allocation: ${character.allocationMethod}`, '',
    ...ATTRIBUTE_NAMES.map((attribute) => `- ${attribute}: ${character.attributes[attribute]}`)];
  if (adventure.premise) lines.push('', '## Premise', '', adventure.premise);
  let chapter: number | undefined;
  adventure.segments.forEach((segment, index) => {
    if (chapter !== segment.chapterNumber) {
      chapter = segment.chapterNumber;
      lines.push('', `## Chapter ${chapter}`);
    }
    lines.push('', `### Scene ${index + 1}`, '', segment.narrative);
    if (segment.check) lines.push('', checkText(segment.check));
    lines.push('', 'Choices:', '');
    segment.choices.forEach((choice, option) => {
      const selected = choice.id === segment.selectedChoiceId ? ' **[Selected]**' : '';
      lines.push(`${option + 1}.${selected} ${choice.text}`);
    });
  });
  const phase = adventure.phase;
  if (phase.kind !== 'ready') {
    lines.push('', '## Pending state', '');
    if (phase.kind === 'pending-summary') lines.push(`Chapter ${phase.chapterNumber} memory update pending. All completed scenes are included above.`);
    else if (phase.kind === 'pending-opening') lines.push('Opening generation pending; no opening scene has been completed.');
    else {
      lines.push(`The selected option in Scene ${adventure.segments.length} is awaiting ${phase.kind === 'pending-assessment' ? 'assessment' : 'narration'}. No resulting scene has been completed.`);
      if (phase.kind === 'pending-narration') lines.push('', checkText(phase.check));
    }
  }
  return `${lines.join('\n')}\n`;
}
