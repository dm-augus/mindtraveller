import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App(): React.JSX.Element {
  return (
    <main className="app-shell">
      <h1>Mindtraveller</h1>
      <p>The adventure begins here.</p>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
