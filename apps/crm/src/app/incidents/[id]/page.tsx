import type { Incident } from '@csl/shared-types';

interface IncidentPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { id } = await params;

  return (
    <>
      <h1>Incident</h1>
      <p>Incident {id}</p>
    </>
  );
}
