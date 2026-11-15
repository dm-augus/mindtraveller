import { translate, label } from './i18n';
import { RULES_SECTIONS, type RulesSection } from './rules-reference';
import { ALLOCATION_BUDGETS, ATTRIBUTE_NAMES, ATTRIBUTE_RANGES, ATTRIBUTE_THRESHOLD_STEP,
  D100_SIDES, DIFFICULTY_BASE_THRESHOLDS, MAX_SUCCESS_THRESHOLD, MIN_SUCCESS_THRESHOLD } from './rules';
import type { InterfaceLanguage } from './types';

/** UI display only; GAME_RULES_TEXT remains canonical input for the narrator. */
export function localizedRules(locale: InterfaceLanguage): readonly RulesSection[] {
  if (locale === 'en') return RULES_SECTIONS;
  const t: typeof translate = translate;
  const signed = (value: number) => value > 0 ? `+${value}` : String(value);
  return [
    { heading: t(locale, 'rules.choicesTitle'), text: t(locale, 'rules.choices') },
    { heading: t(locale, 'rules.attributesTitle'), text: [t(locale, 'rules.attributes'), ...ATTRIBUTE_NAMES.map(attribute => {
      const { min, max } = ATTRIBUTE_RANGES[attribute];
      return t(locale, 'rules.attributeLine', { attribute, min: signed(min), max: signed(max), effect: t(locale, `rules.${attribute}`) });
    })].join('\n') },
    { heading: t(locale, 'rules.creationTitle'), text: [
      ...(['Balanced', 'Simplified'] as const).map(method => t(locale, 'rules.allocation', { method, ...ALLOCATION_BUDGETS[method] })),
      t(locale, 'rules.creation')].join('\n') },
    { heading: t(locale, 'rules.checkTitle'), text: `${t(locale, 'rules.check')}\n${t(locale, 'rules.authority')}` },
    { heading: t(locale, 'check.difficulty'), text: [t(locale, 'rules.difficulty'),
      ...Object.entries(DIFFICULTY_BASE_THRESHOLDS).map(([difficulty, value]) => `${label(locale, difficulty)}: ${value}.`)].join('\n') },
    { heading: t(locale, 'rules.thresholdTitle'), text: [t(locale, 'rules.formula', {
      step: ATTRIBUTE_THRESHOLD_STEP, min: MIN_SUCCESS_THRESHOLD, max: MAX_SUCCESS_THRESHOLD
    }), t(locale, 'rules.roll', { sides: D100_SIDES })].join('\n') },
    { heading: label(locale, 'Nature'), text: t(locale, 'rules.nature') }
  ];
}
