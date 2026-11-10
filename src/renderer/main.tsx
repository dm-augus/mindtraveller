import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App(): React.JSX.Element {
  const [version, setVersion] = useState('');
  useEffect(() => {
    void window.mindtraveller.getAppInfo().then((info) => setVersion(info.version));
  }, []);

  return (
    <main className="app-shell">
      <h1>Mindtraveller</h1>
      <p>The adventure begins here.</p>
      {version && <small>Version {version}</small>}
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
