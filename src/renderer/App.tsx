import { useLocale } from './LocaleContext';
import type { MessageKey } from '../shared/i18n';
import React, { useEffect, useRef, useState } from 'react';
import type { Adventure, CheckRecord, NewStoryRequest, ProviderSettings } from '../shared/types';
import type { CharacterSetup } from '../shared/character-rules';
import { NewStorySetup } from './NewStorySetup';
import { RulesView } from './RulesView';
import { SettingsView } from './SettingsView';
import diceArtwork from '../assets/branding/dice_artwork.png';
import newStoryIcon from '../assets/icons/new_story_transparent.png';
import rulesIcon from '../assets/icons/rules_transparent.png';
import settingsIcon from '../assets/icons/settings_transparent.png';
import quitIcon from '../assets/icons/quit_transparent.png';
import bookIcon from '../assets/icons/status_book_transparent.png';
import choiceArrow from '../assets/icons/choice_arrow_transparent.png';
import { LANGUAGE_LABELS } from '../shared/story-language';

type View = 'story' | 'new-story' | 'rules' | 'settings';
const NAVIGATION = [
  { view: 'new-story', label: 'nav.newStory', icon: newStoryIcon },
  { view: 'rules', label: 'nav.rules', icon: rulesIcon },
  { view: 'settings', label: 'nav.settings', icon: settingsIcon }
] as const;
const VIEW_TITLES: Record<View, MessageKey> = {
  story: 'view.story', 'new-story': 'view.newStory', rules: 'view.rules', settings: 'view.settings'
};

function statusText(adventure: Adventure | null): MessageKey {
  if (!adventure) return 'story.awaiting';
  switch (adventure.phase.kind) {
    case 'ready': return 'story.ready';
    case 'pending-opening': return 'story.pendingOpening';
    case 'pending-assessment': return 'story.pendingAction';
    case 'pending-narration': return 'story.pendingNarration';
    case 'pending-summary': return 'story.pendingSummary';
  }
}

function CheckResult({ check, pending = false }: { check: CheckRecord; pending?: boolean }): React.JSX.Element {
  const { t, label, errorText } = useLocale();
  const signedValue = formatAttributeValue(check.attributeValue);
  return <section className={`check-result ${check.outcome}`} aria-label={pending ? t('check.saved') : t('check.result')}>
    <div className="check-heading"><strong>{pending ? t('check.savedTitle') : t('check.title')}</strong>
      <span className="check-outcome">{check.outcome === 'success' ? t('check.success') : t('check.failure')}</span></div>
    <dl className="check-details">
      <div><dt>{t('check.difficulty')}</dt><dd>{label(check.difficulty)}</dd></div>
      <div><dt>{t('check.attribute')}</dt><dd>{label(check.attribute)} {signedValue}</dd></div>
      <div><dt>{t('check.roll')}</dt><dd>{check.roll}</dd></div>
      <div><dt>{t('check.threshold')}</dt><dd>{check.threshold}</dd></div>
    </dl>
  </section>;
}

function formatAttributeValue(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function PendingStoryState({ adventure }: { adventure: Adventure }): React.JSX.Element | null {
  const { t, label, errorText } = useLocale();
  const phase = adventure.phase;
  if (phase.kind === 'ready') return null;
  if (phase.kind === 'pending-opening') return <div className="pending-story" role="status">
    <strong>{t('story.openingTitle')}</strong><p>{t('story.openingHelp')}</p>
  </div>;
  if (phase.kind === 'pending-summary') return <div className="pending-story" role="status">
    <strong>{t('story.summaryTitle')}</strong><p>{t('story.summaryHelp')}</p>
  </div>;
  return <div className="pending-story" role="status">
    {phase.kind === 'pending-narration' ? <CheckResult check={phase.check} pending />
      : <strong>{t('story.assessmentTitle')}</strong>}
    <p>{t('story.chosen', { choice: phase.choice.choiceText })}</p>
  </div>;
}

function StoryContent({ adventure, onNewStory }: { adventure: Adventure | null; onNewStory: () => void }): React.JSX.Element {
  const { t, label, errorText } = useLocale();
  if (!adventure || !adventure.segments.length) return (
    <div className="welcome">
      <img className="welcome-book" src={bookIcon} alt="" />
      <p className="eyebrow">{t('story.tagline')}</p><h2>{t('story.awaiting')}</h2>
      <p>{t('story.welcome')}</p>
      {!adventure && <button className="retro-button welcome-button" onClick={onNewStory}>{t('story.begin')}</button>}
      {adventure && <PendingStoryState adventure={adventure} />}
    </div>
  );
  return <div className="story-transcript">
    {adventure.premise && <p className="story-premise">{adventure.premise}</p>}
    {adventure.segments.map((segment, index) => (
      <article className="story-segment" key={segment.id} data-segment-id={segment.id}>
        {(index === 0 || segment.chapterNumber !== adventure.segments[index - 1].chapterNumber) &&
          <h2 className="chapter-heading">{t('story.chapter', { number: segment.chapterNumber })}</h2>}
        {segment.check && <CheckResult check={segment.check} />}
        {segment.narrative.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        {segment.selectedChoiceId && <p className="chosen-action">{t('story.chosen', { choice: segment.choices.find((choice) => choice.id === segment.selectedChoiceId)?.text ?? '' })}</p>}
      </article>
    ))}
    <PendingStoryState adventure={adventure} />
  </div>;
}

export function App(): React.JSX.Element {
  const { t, label, errorText } = useLocale();
  const [view, setView] = useState<View>('story');
  const [version, setVersion] = useState('');
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<MessageKey | ''>('');
  const [error, setError] = useState<unknown>('');
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState('');
  const exportInFlight = useRef(false);
  const [confirmation, setConfirmation] = useState<Extract<NewStoryRequest, { kind: 'confirmation-required' }> | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const inFlight = useRef(false);
  const confirmationFocus = useRef<HTMLButtonElement>(null);
  const storyScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (confirmation) confirmationFocus.current?.focus(); }, [confirmation]);
  useEffect(() => { storyScroll.current?.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => {
    if (view !== 'story' || !adventure) return;
    const panel = storyScroll.current;
    const target = adventure.phase.kind === 'ready'
      ? panel?.querySelector('.story-segment:last-of-type')
      : adventure.phase.kind === 'pending-narration'
        ? panel?.querySelector('.pending-story .check-result')
        : panel?.querySelector('.pending-story');
    if (panel && target) {
      panel.scrollTo({ top: panel.scrollTop + target.getBoundingClientRect().top - panel.getBoundingClientRect().top });
    }
  }, [adventure?.segments.length, adventure?.phase.kind, view]);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      window.mindtraveller.getAppInfo(), window.mindtraveller.restoreAdventure(), window.mindtraveller.getProviderSettings()
    ]).then(([info, saved, configuration]) => {
      if (!active) return;
      if (info.status === 'fulfilled') setVersion(info.value.version);
      if (saved.status === 'fulfilled') setAdventure(saved.value);
      else setError('error.restore');
      if (configuration.status === 'fulfilled') setSettings(configuration.value);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function runOperation(action: () => Promise<Adventure>, label: MessageKey): Promise<void> {
    if (inFlight.current || exportInFlight.current) return;
    inFlight.current = true;
    setOperation(label);
    setError('');
    setExportFeedback('');
    try { setAdventure(await action()); }
    catch (failure) {
      setError(failure);
      try { setAdventure(await window.mindtraveller.restoreAdventure()); } catch { /* Keep the last visible story. */ }
    } finally { inFlight.current = false; setOperation(''); }
  }

  function retry(): void {
    if (!adventure || adventure.phase.kind === 'ready') return;
    const phase = adventure.phase;
    void runOperation(() => phase.kind === 'pending-opening' ? window.mindtraveller.retryOpening()
      : window.mindtraveller.retryTurn('choice' in phase ? phase.choice.turnId : phase.turnId).then((result) => result.adventure),
    phase.kind === 'pending-summary' ? 'story.summarizing' : 'story.continuing');
  }

  function startStory(setup: CharacterSetup): void {
    void runOperation(async () => {
      const opened = await window.mindtraveller.startOpening(setup);
      setView('story');
      return opened;
    }, 'story.opening');
  }

  async function requestNewStory(): Promise<void> {
    if (inFlight.current || exportInFlight.current || loading || confirmationBusy || confirmation) return;
    setConfirmationBusy(true); setError('');
    try {
      const request = await window.mindtraveller.requestNewStory();
      if (request.kind === 'confirmation-required') setConfirmation(request);
      else setView('new-story');
    } catch (failure) {
      setError(failure);
    } finally { setConfirmationBusy(false); }
  }

  async function resolveNewStory(decision: 'Yes' | 'No'): Promise<void> {
    if (!confirmation || confirmationBusy) return;
    setConfirmationBusy(true); setError('');
    try {
      const result = await window.mindtraveller.resolveNewStory(confirmation.confirmationId, decision);
      if (result.kind === 'continue-adventure') {
        setAdventure(result.adventure);
        setView('story');
      } else {
        setAdventure(null);
        setView('new-story');
      }
      setConfirmation(null);
    } catch (failure) {
      setError(failure);
      try { setAdventure(await window.mindtraveller.restoreAdventure()); } catch { /* Keep the last visible story. */ }
      setConfirmation(null);
      setView('story');
    } finally { setConfirmationBusy(false); }
  }

  async function quit(): Promise<void> {
    try { await window.mindtraveller.quit(); }
    catch { setError('error.unknown'); }
  }

  async function exportHistory(): Promise<void> {
    if (inFlight.current || exportInFlight.current || loading || confirmationBusy || confirmation || !adventure?.segments.length) return;
    exportInFlight.current = true; setExporting(true); setExportFeedback(''); setError('');
    try {
      const result = await window.mindtraveller.exportHistory();
      if (result.kind === 'saved') setExportFeedback(result.filePath);
    } catch (failure) {
      setError(failure);
    } finally { exportInFlight.current = false; setExporting(false); }
  }

  const current = adventure?.segments.at(-1);
  const pending = adventure !== null && adventure.phase.kind !== 'ready';
  const busy = loading || Boolean(operation) || confirmationBusy || exporting;
  const exportReason = !adventure?.segments.length ? t('export.empty')
    : confirmation ? t('export.confirm')
      : busy ? t('export.wait') : t('export.help');
  const providerLabel = settings ? (settings.activeProvider === 'ollama' ? 'Ollama' : 'OpenAI') : t('story.storyteller');
  const model = settings?.[settings.activeProvider].modelId;
  return (
    <main className="app-shell" data-current-view={view} data-loading={loading} aria-busy={busy}>
      <div className="workspace">
        <aside className="sidebar">
          <h1 className="sidebar-brand">Mindtraveller</h1>
          <div className="branding-frame"><img className="dice-artwork" src={diceArtwork} alt={t('story.diceAlt')} /></div>
          <nav className="main-navigation" aria-label={t('nav.main')}>{NAVIGATION.map((item) => (
            <button key={item.view} className={`retro-button nav-button${view === item.view ? ' is-selected' : ''}`}
              aria-current={view === item.view ? 'page' : undefined} data-view={item.view}
              disabled={exporting || (item.view === 'new-story' && busy)}
              onClick={() => { if (item.view === 'new-story') void requestNewStory(); else setView(item.view); }}>
              <img src={item.icon} alt="" /><span>{t(item.label)}</span>
            </button>
          ))}</nav>
          <hr className="sidebar-divider" />
          <button className="retro-button nav-button quit-button" data-action="quit" onClick={() => { void quit(); }}><img src={quitIcon} alt="" /><span>{t('nav.quit')}</span></button>
          <div className="sidebar-footer"><span className="eyebrow">{t('story.traveller')}</span><strong>{adventure?.character.name ?? t('story.unwritten')}</strong>
            {adventure && <span>{t('story.nature', { nature: adventure.character.nature })}</span>}</div>
        </aside>
        <div className="adventure-body">
          <section className="story-panel inset-panel" aria-labelledby="view-title">
            <div className="section-header"><h2 id="view-title">{t(VIEW_TITLES[view])}</h2>
              {view !== 'story' && <button className="return-story" data-action="return-story" onClick={() => setView('story')}>{t('nav.return')}</button>}
              {view === 'story' && <div className="story-tools">
              {adventure && <span className="chapter-label" aria-label={t('story.language')}>
                <span className="story-genre">{label(adventure.theme)}</span>
                {current && <span>{t('story.chapter', { number: current.chapterNumber })}</span>}<span>{LANGUAGE_LABELS[adventure.language]}</span></span>}
              <button className="return-story export-history" type="button" data-action="export-history"
                disabled={busy || Boolean(confirmation) || !adventure?.segments.length} title={exportReason}
                onClick={() => { void exportHistory(); }}>{exporting ? t('export.busy') : t('export.title')}</button>
              </div>}</div>
            {Boolean(error) && !(view === 'story' && adventure?.phase.kind === 'pending-opening') &&
              <div className="error-banner" role="alert">{errorText(error)}</div>}
            {exportFeedback && <div className="export-feedback" role="status">{t('export.saved', { path: exportFeedback })}</div>}
            <div className="story-scroll" ref={storyScroll} tabIndex={0} aria-label={t(VIEW_TITLES[view])}>
              {view === 'story' && <StoryContent adventure={adventure} onNewStory={() => { void requestNewStory(); }} />}
              {view === 'new-story' && <NewStorySetup busy={busy} onStart={startStory} />}
              {view === 'rules' && <RulesView adventure={adventure} />}
              {view === 'settings' && <SettingsView settings={settings} onSaved={setSettings} />}
            </div>
          </section>
          <section className="decision-panel inset-panel" aria-labelledby="decision-title">
            <div className="section-header"><h2 id="decision-title">{view === 'story' ? t('story.decision') : t('story.continues')}</h2></div>
            <div className="choice-list">{view !== 'story' ? <button className="retro-button choice-button" onClick={() => setView('story')}><img src={choiceArrow} alt="" /><span>{t('nav.returnLong')}</span></button> : <>
              {operation && <p className="decision-hint" role="status">{t(operation || 'story.ready')}</p>}
              {pending && <p className="decision-hint pending-hint">{adventure.phase.kind === 'pending-opening'
                ? t('story.openingSaved')
                : adventure.phase.kind === 'pending-summary'
                  ? t('story.summarySaved')
                  : t('story.actionSaved')}</p>}
              {adventure?.phase.kind === 'pending-opening' && error && <p className="pending-error" role="alert">{errorText(error)}</p>}
              {adventure?.phase.kind === 'pending-narration' && <p className="pending-roll-summary" aria-label={t('check.summary')}>
                {label(adventure.phase.check.difficulty)} · {label(adventure.phase.check.attribute)} {formatAttributeValue(adventure.phase.check.attributeValue)} ·
                D100 {adventure.phase.check.roll} / {adventure.phase.check.threshold} ·
                {adventure.phase.check.outcome === 'success' ? t('check.success') : t('check.failure')}
              </p>}
              {pending && <button className="retro-button retry-button" disabled={busy} onClick={retry}>
                {adventure.phase.kind === 'pending-opening' ? t('story.retryOpening') : adventure.phase.kind === 'pending-summary' ? t('story.retrySummary') : t('story.retryAction')}
              </button>}
              {current?.choices.map((choice) => <button key={choice.id} className="retro-button choice-button" data-choice-id={choice.id}
                disabled={busy || pending} onClick={() => { void runOperation(() => window.mindtraveller.submitChoice(current.id, choice.id).then((result) => result.adventure), 'story.continuing'); }}>
                <img src={choiceArrow} alt="" /><span>{choice.text}</span></button>)}
              {!current && !pending && <p className="decision-hint">{loading ? t('story.loading') : t('story.firstChoices')}</p>}
            </>}</div>
          </section>
        </div>
      </div>
      <footer className="statusbar"><div className="status-message" role="status"><img src={bookIcon} alt="" /><span>{operation ? t(operation) : loading ? t('story.loading') : t(statusText(adventure))}</span></div>
        <span className="provider-status" title={model ?? t('story.noModel')}>{providerLabel} · {model ?? t('story.noModel')}</span>
        <span className="version">Mindtraveller {version ? `v${version}` : '—'}</span></footer>
      {confirmation && <div className="modal-backdrop"><section className="confirmation-dialog" role="alertdialog" aria-modal="true"
        aria-labelledby="confirmation-title" aria-describedby="confirmation-description"
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); void resolveNewStory('No'); }
          if (event.key === 'Tab') {
            const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
            if (buttons.length < 2) return;
            if (event.shiftKey && document.activeElement === buttons[0]) {
              event.preventDefault(); buttons[buttons.length - 1].focus();
            } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
              event.preventDefault(); buttons[0].focus();
            }
          }
        }}>
        <div className="section-header"><h2 id="confirmation-title">{t('confirm.title')}</h2></div>
        <div className="confirmation-body"><p id="confirmation-description">{t('confirm.help')}</p>
          <div className="confirmation-actions">
            <button ref={confirmationFocus} className="retro-button" type="button" disabled={confirmationBusy}
              onClick={() => { void resolveNewStory('No'); }}>{t('confirm.no')}</button>
            <button className="retro-button" type="button" disabled={confirmationBusy}
              onClick={() => { void resolveNewStory('Yes'); }}>{t('confirm.yes')}</button>
          </div></div>
      </section></div>}
    </main>
  );
}
