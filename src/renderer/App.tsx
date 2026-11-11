import React, { useEffect, useRef, useState } from 'react';
import type { Adventure, ProviderSettings } from '../shared/types';
import { RULES_SECTIONS } from '../shared/rules-reference';
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

function StoryContent({ adventure, onNewStory }: { adventure: Adventure | null; onNewStory: () => void }): React.JSX.Element {
  if (!adventure || !adventure.segments.length) return (
    <div className="welcome">
      <img className="welcome-book" src={bookIcon} alt="" />
      <p className="eyebrow">Every choice opens a new path</p><h2>A new adventure awaits…</h2>
      <p>Journey into medieval worlds of mystery, magic, and romance. Your character, your choices, your story.</p>
      {!adventure && <button className="retro-button welcome-button" onClick={onNewStory}>Begin a new story</button>}
    </div>
  );
  return <div className="story-transcript">
    {adventure.premise && <p className="story-premise">{adventure.premise}</p>}
    {adventure.segments.map((segment, index) => (
      <article className="story-segment" key={segment.id} data-segment-id={segment.id}>
        {(index === 0 || segment.chapterNumber !== adventure.segments[index - 1].chapterNumber) &&
          <h2 className="chapter-heading">Chapter {segment.chapterNumber}</h2>}
        {segment.narrative.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        {segment.selectedChoiceId && <p className="chosen-action">You chose: {segment.choices.find((choice) => choice.id === segment.selectedChoiceId)?.text}</p>}
      </article>
    ))}
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
  const inFlight = useRef(false);
  const storyScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { storyScroll.current?.scrollTo({ top: 0 }); }, [view]);
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

  async function quit(): Promise<void> {
    try { await window.mindtraveller.quit(); }
    catch { setError('Unable to close the application. Try Quit again.'); }
  }

  const current = adventure?.segments.at(-1);
  const pending = adventure !== null && adventure.phase.kind !== 'ready';
  const busy = loading || Boolean(operation);
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
              aria-current={view === item.view ? 'page' : undefined} data-view={item.view} onClick={() => setView(item.view)}>
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
            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="story-scroll" ref={storyScroll} tabIndex={0} aria-label={VIEW_TITLES[view]}>
              {view === 'story' && <StoryContent adventure={adventure} onNewStory={() => setView('new-story')} />}
              {view === 'new-story' && <div className="page-introduction"><p className="eyebrow">Turn the first page</p><h2>Who will you become?</h2>
                <p>Choose a medieval world, create your traveller, and let your first decision set the adventure in motion.</p>
                <dl className="theme-descriptions"><dt>Horror</dt><dd>Ancient secrets, haunted places, and the unknown.</dd>
                  <dt>Romance</dt><dd>Unexpected encounters, loyalties, and matters of the heart.</dd><dt>High Fantasy</dt><dd>Magic, mythical creatures, and extraordinary quests.</dd></dl></div>}
              {view === 'rules' && <div className="rules-content">{RULES_SECTIONS.map((section) => <section key={section.heading}><h3>{section.heading}</h3><p>{section.text}</p></section>)}</div>}
              {view === 'settings' && <div className="page-introduction"><p className="eyebrow">The voice behind your adventure</p><h2>Your storyteller</h2>
                <p>Stories can be told by a local Ollama model or an OpenAI model.</p>
                <dl className="settings-summary"><dt>Active provider</dt><dd>{providerLabel}</dd><dt>Selected model</dt><dd>{model ?? 'No model selected'}</dd>
                  <dt>OpenAI key</dt><dd>{settings?.openai.hasSavedKey ? 'Saved securely' : 'No saved key'}</dd></dl></div>}
            </div>
          </section>
          <section className="decision-panel inset-panel" aria-labelledby="decision-title">
            <div className="section-header"><h2 id="decision-title">{view === 'story' ? 'What will you do?' : 'Your journey continues'}</h2></div>
            <div className="choice-list">{view !== 'story' ? <button className="retro-button choice-button" onClick={() => setView('story')}><img src={choiceArrow} alt="" /><span>Return to your story</span></button> : <>
              {current?.choices.map((choice) => <button key={choice.id} className="retro-button choice-button" data-choice-id={choice.id}
                disabled={busy || pending} onClick={() => { void runOperation(() => window.mindtraveller.submitChoice(current.id, choice.id).then((result) => result.adventure), 'Continuing your story…'); }}>
                <img src={choiceArrow} alt="" /><span>{choice.text}</span></button>)}
              {!current && <p className="decision-hint">{loading ? 'Opening your storybook…' : 'Start a story to discover your first choices.'}</p>}
              {pending && <button className="retro-button retry-button" disabled={busy} onClick={retry}>Continue saved operation</button>}
            </>}</div>
          </section>
        </div>
      </div>
      <footer className="statusbar"><div className="status-message" role="status"><img src={bookIcon} alt="" /><span>{operation || (loading ? 'Opening your storybook…' : statusText(adventure))}</span></div>
        <span className="provider-status" title={model ?? 'No model selected'}>{providerLabel} · {model ?? 'No model selected'}</span>
        <span className="version">Mindtraveller {version ? `v${version}` : '—'}</span></footer>
    </main>
  );
}
