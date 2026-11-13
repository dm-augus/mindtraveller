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

type View = 'story' | 'new-story' | 'rules' | 'settings';
const NAVIGATION = [
  { view: 'new-story', label: 'New Story', icon: newStoryIcon },
  { view: 'rules', label: 'Rules', icon: rulesIcon },
  { view: 'settings', label: 'Settings', icon: settingsIcon }
] as const;
const VIEW_TITLES: Record<View, string> = {
  story: 'Your adventure', 'new-story': 'A new story', rules: 'Rules of the journey', settings: 'Storyteller settings'
};

function statusText(adventure: Adventure | null): string {
  if (!adventure) return 'A new adventure awaits…';
  switch (adventure.phase.kind) {
    case 'ready': return 'Ready for your next decision.';
    case 'pending-opening': return 'Opening story awaiting continuation.';
    case 'pending-assessment': return 'Your chosen action is awaiting resolution.';
    case 'pending-narration': return 'Roll saved · Narration pending.';
    case 'pending-summary': return 'Progress saved · Memory update pending.';
  }
}

function CheckResult({ check, pending = false }: { check: CheckRecord; pending?: boolean }): React.JSX.Element {
  const signedValue = formatAttributeValue(check.attributeValue);
  return <section className={`check-result ${check.outcome}`} aria-label={pending ? 'Saved check result' : 'Check result'}>
    <div className="check-heading"><strong>{pending ? 'Roll saved · Awaiting narration' : 'D100 check'}</strong>
      <span className="check-outcome">{check.outcome === 'success' ? 'Success' : 'Failure'}</span></div>
    <dl className="check-details">
      <div><dt>Difficulty</dt><dd>{check.difficulty}</dd></div>
      <div><dt>Attribute</dt><dd>{check.attribute} {signedValue}</dd></div>
      <div><dt>D100 roll</dt><dd>{check.roll}</dd></div>
      <div><dt>Threshold</dt><dd>{check.threshold}</dd></div>
    </dl>
  </section>;
}

function formatAttributeValue(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function PendingStoryState({ adventure }: { adventure: Adventure }): React.JSX.Element | null {
  const phase = adventure.phase;
  if (phase.kind === 'ready') return null;
  if (phase.kind === 'pending-opening') return <div className="pending-story" role="status">
    <strong>Opening awaiting generation</strong><p>Your character is saved. Continue to request the opening scene.</p>
  </div>;
  if (phase.kind === 'pending-summary') return <div className="pending-story" role="status">
    <strong>Story memory update pending</strong><p>The latest scene is saved. Continue to finish the chapter summary.</p>
  </div>;
  return <div className="pending-story" role="status">
    {phase.kind === 'pending-narration' ? <CheckResult check={phase.check} pending />
      : <strong>Action awaiting assessment</strong>}
    <p>You chose: {phase.choice.choiceText}</p>
  </div>;
}

function StoryContent({ adventure, onNewStory }: { adventure: Adventure | null; onNewStory: () => void }): React.JSX.Element {
  if (!adventure || !adventure.segments.length) return (
    <div className="welcome">
      <img className="welcome-book" src={bookIcon} alt="" />
      <p className="eyebrow">Every choice opens a new path</p><h2>A new adventure awaits…</h2>
      <p>Journey into medieval worlds of mystery, magic, and romance. Your character, your choices, your story.</p>
      {!adventure && <button className="retro-button welcome-button" onClick={onNewStory}>Begin a new story</button>}
      {adventure && <PendingStoryState adventure={adventure} />}
    </div>
  );
  return <div className="story-transcript">
    {adventure.premise && <p className="story-premise">{adventure.premise}</p>}
    {adventure.segments.map((segment, index) => (
      <article className="story-segment" key={segment.id} data-segment-id={segment.id}>
        {(index === 0 || segment.chapterNumber !== adventure.segments[index - 1].chapterNumber) &&
          <h2 className="chapter-heading">Chapter {segment.chapterNumber}</h2>}
        {segment.check && <CheckResult check={segment.check} />}
        {segment.narrative.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        {segment.selectedChoiceId && <p className="chosen-action">You chose: {segment.choices.find((choice) => choice.id === segment.selectedChoiceId)?.text}</p>}
      </article>
    ))}
    <PendingStoryState adventure={adventure} />
  </div>;
}

export function App(): React.JSX.Element {
  const [view, setView] = useState<View>('story');
  const [version, setVersion] = useState('');
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState('');
  const [error, setError] = useState('');
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
    target?.scrollIntoView({ block: 'start' });
  }, [adventure?.segments.length, adventure?.phase.kind, view]);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      window.mindtraveller.getAppInfo(), window.mindtraveller.restoreAdventure(), window.mindtraveller.getProviderSettings()
    ]).then(([info, saved, configuration]) => {
      if (!active) return;
      if (info.status === 'fulfilled') setVersion(info.value.version);
      if (saved.status === 'fulfilled') setAdventure(saved.value);
      else setError('Unable to restore your adventure. Reopen the application to try again.');
      if (configuration.status === 'fulfilled') setSettings(configuration.value);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function runOperation(action: () => Promise<Adventure>, label: string): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setOperation(label);
    setError('');
    try { setAdventure(await action()); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The story could not continue. Try again.');
      try { setAdventure(await window.mindtraveller.restoreAdventure()); } catch { /* Keep the last visible story. */ }
    } finally { inFlight.current = false; setOperation(''); }
  }

  function retry(): void {
    if (!adventure || adventure.phase.kind === 'ready') return;
    const phase = adventure.phase;
    void runOperation(() => phase.kind === 'pending-opening' ? window.mindtraveller.retryOpening()
      : window.mindtraveller.retryTurn('choice' in phase ? phase.choice.turnId : phase.turnId).then((result) => result.adventure),
    phase.kind === 'pending-summary' ? 'Updating story memory…' : 'Continuing your story…');
  }

  function startStory(setup: CharacterSetup): void {
    void runOperation(async () => {
      const opened = await window.mindtraveller.startOpening(setup);
      setView('story');
      return opened;
    }, 'Opening your story…');
  }

  async function requestNewStory(): Promise<void> {
    if (inFlight.current || loading || confirmationBusy || confirmation) return;
    setConfirmationBusy(true); setError('');
    try {
      const request = await window.mindtraveller.requestNewStory();
      if (request.kind === 'confirmation-required') setConfirmation(request);
      else setView('new-story');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to prepare a new story. Try again.');
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
      setError(failure instanceof Error ? failure.message : 'Unable to change stories. Try again.');
      try { setAdventure(await window.mindtraveller.restoreAdventure()); } catch { /* Keep the last visible story. */ }
      setConfirmation(null);
      setView('story');
    } finally { setConfirmationBusy(false); }
  }

  async function quit(): Promise<void> {
    try { await window.mindtraveller.quit(); }
    catch { setError('Unable to close the application. Try Quit again.'); }
  }

  const current = adventure?.segments.at(-1);
  const pending = adventure !== null && adventure.phase.kind !== 'ready';
  const busy = loading || Boolean(operation) || confirmationBusy;
  const providerLabel = settings ? (settings.activeProvider === 'ollama' ? 'Ollama' : 'OpenAI') : 'Storyteller';
  const model = settings?.[settings.activeProvider].modelId;
  return (
    <main className="app-shell" data-current-view={view} data-loading={loading} aria-busy={busy}>
      <header className="titlebar"><h1>Mindtraveller</h1><span className="titlebar-context">{adventure?.theme ?? 'A world of your own'}</span></header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="branding-frame"><img className="dice-artwork" src={diceArtwork} alt="A twenty-sided die surrounded by violet flames" /></div>
          <nav className="main-navigation" aria-label="Main navigation">{NAVIGATION.map((item) => (
            <button key={item.view} className={`retro-button nav-button${view === item.view ? ' is-selected' : ''}`}
              aria-current={view === item.view ? 'page' : undefined} data-view={item.view}
              disabled={item.view === 'new-story' && busy}
              onClick={() => { if (item.view === 'new-story') void requestNewStory(); else setView(item.view); }}>
              <img src={item.icon} alt="" /><span>{item.label}</span>
            </button>
          ))}</nav>
          <hr className="sidebar-divider" />
          <button className="retro-button nav-button quit-button" data-action="quit" onClick={() => { void quit(); }}><img src={quitIcon} alt="" /><span>Quit</span></button>
          <div className="sidebar-footer"><span className="eyebrow">Your traveller</span><strong>{adventure?.character.name ?? 'A story yet unwritten'}</strong>
            {adventure && <span>{adventure.character.nature} Nature</span>}</div>
        </aside>
        <div className="adventure-body">
          <section className="story-panel inset-panel" aria-labelledby="view-title">
            <div className="section-header"><h2 id="view-title">{VIEW_TITLES[view]}</h2>
              {view !== 'story' && <button className="return-story" data-action="return-story" onClick={() => setView('story')}>Return to story</button>}
              {view === 'story' && current && <span className="chapter-label">Chapter {current.chapterNumber}</span>}</div>
            {error && !(view === 'story' && adventure?.phase.kind === 'pending-opening') &&
              <div className="error-banner" role="alert">{error}</div>}
            <div className="story-scroll" ref={storyScroll} tabIndex={0} aria-label={VIEW_TITLES[view]}>
              {view === 'story' && <StoryContent adventure={adventure} onNewStory={() => { void requestNewStory(); }} />}
              {view === 'new-story' && <NewStorySetup busy={busy} onStart={startStory} />}
              {view === 'rules' && <RulesView adventure={adventure} />}
              {view === 'settings' && <SettingsView settings={settings} onSaved={setSettings} />}
            </div>
          </section>
          <section className="decision-panel inset-panel" aria-labelledby="decision-title">
            <div className="section-header"><h2 id="decision-title">{view === 'story' ? 'What will you do?' : 'Your journey continues'}</h2></div>
            <div className="choice-list">{view !== 'story' ? <button className="retro-button choice-button" onClick={() => setView('story')}><img src={choiceArrow} alt="" /><span>Return to your story</span></button> : <>
              {operation && <p className="decision-hint" role="status">{operation}</p>}
              {pending && <p className="decision-hint pending-hint">{adventure.phase.kind === 'pending-opening'
                ? 'Your opening is saved and ready to continue.'
                : adventure.phase.kind === 'pending-summary'
                  ? 'The scene is saved. Finish the story memory update to continue.'
                  : 'Your selected action is saved. Other choices are unavailable until it is resolved.'}</p>}
              {adventure?.phase.kind === 'pending-opening' && error && <p className="pending-error" role="alert">{error}</p>}
              {adventure?.phase.kind === 'pending-narration' && <p className="pending-roll-summary" aria-label="Saved roll summary">
                {adventure.phase.check.difficulty} · {adventure.phase.check.attribute} {formatAttributeValue(adventure.phase.check.attributeValue)} ·
                D100 {adventure.phase.check.roll} / {adventure.phase.check.threshold} ·
                {adventure.phase.check.outcome === 'success' ? 'Success' : 'Failure'}
              </p>}
              {pending && <button className="retro-button retry-button" disabled={busy} onClick={retry}>
                {adventure.phase.kind === 'pending-opening' ? 'Retry opening' : adventure.phase.kind === 'pending-summary' ? 'Retry memory update' : 'Retry selected action'}
              </button>}
              {current?.choices.map((choice) => <button key={choice.id} className="retro-button choice-button" data-choice-id={choice.id}
                disabled={busy || pending} onClick={() => { void runOperation(() => window.mindtraveller.submitChoice(current.id, choice.id).then((result) => result.adventure), 'Continuing your story…'); }}>
                <img src={choiceArrow} alt="" /><span>{choice.text}</span></button>)}
              {!current && !pending && <p className="decision-hint">{loading ? 'Opening your storybook…' : 'Start a story to discover your first choices.'}</p>}
            </>}</div>
          </section>
        </div>
      </div>
      <footer className="statusbar"><div className="status-message" role="status"><img src={bookIcon} alt="" /><span>{operation || (loading ? 'Opening your storybook…' : statusText(adventure))}</span></div>
        <span className="provider-status" title={model ?? 'No model selected'}>{providerLabel} · {model ?? 'No model selected'}</span>
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
        <div className="section-header"><h2 id="confirmation-title">Start a new story?</h2></div>
        <div className="confirmation-body"><p id="confirmation-description">This will replace your saved adventure. Do you want to continue?</p>
          <div className="confirmation-actions">
            <button ref={confirmationFocus} className="retro-button" type="button" disabled={confirmationBusy}
              onClick={() => { void resolveNewStory('No'); }}>No, keep my story</button>
            <button className="retro-button" type="button" disabled={confirmationBusy}
              onClick={() => { void resolveNewStory('Yes'); }}>Yes, start a new story</button>
          </div></div>
      </section></div>}
    </main>
  );
}
