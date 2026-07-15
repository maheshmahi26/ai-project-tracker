import { useEffect, useState } from 'react';
import { APP_NAME } from '@ai-projectos/shared';

interface Ping {
  name: string;
  env: string;
  message: string;
}

export function App(): React.JSX.Element {
  const [ping, setPing] = useState<Ping | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/ping')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Ping) => setPing(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Request failed'));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', lineHeight: 1.5 }}>
      <h1>{APP_NAME}</h1>
      <p>Monorepo foundation is up. Full UI shell arrives in TASK-04.</p>
      <h2>API connectivity</h2>
      {ping && (
        <pre style={{ background: '#f4f4f5', padding: '1rem', borderRadius: 8 }}>
          {JSON.stringify(ping, null, 2)}
        </pre>
      )}
      {error && <p style={{ color: 'crimson' }}>API not reachable yet: {error}</p>}
      {!ping && !error && <p>Checking API…</p>}
    </main>
  );
}
