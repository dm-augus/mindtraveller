import { translate } from '../src/shared/i18n';
translate('pt-BR', 'story.chapter', { number: 1 });
// @ts-expect-error Unknown catalog keys are not accepted.
translate('pt-BR', 'story.nonexistent');
// @ts-expect-error Placeholder names come from the English catalog.
translate('pt-BR', 'story.chapter', { chapter: 1 });
// @ts-expect-error Every required placeholder must be present in a parameter object.
translate('pt-BR', 'validation.range', { attribute: 'Strength', min: -2 });
