import { useParams } from 'react-router';

export function CallPage() {
  const { id } = useParams();

  return (
    <main>
      <h1>Mediation call</h1>
      <p>Incident {id}</p>
    </main>
  );
}
