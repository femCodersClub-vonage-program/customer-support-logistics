import { useParams } from 'react-router';

export function IncidentPage() {
  const { id } = useParams();

  return (
    <main>
      <h1>Incident</h1>
      <p>Incident {id}</p>
    </main>
  );
}
