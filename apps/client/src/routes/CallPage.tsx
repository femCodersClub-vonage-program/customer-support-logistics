import { useParams } from 'react-router';

import { useBlockInterruptions } from '../pwa/interruptions.ts';

export function CallPage() {
  const { id } = useParams();

  useBlockInterruptions();

  return (
    <main>
      <h1>Mediation call</h1>
      <p>Incident {id}</p>
    </main>
  );
}
