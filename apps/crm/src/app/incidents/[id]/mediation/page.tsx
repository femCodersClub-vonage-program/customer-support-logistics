import type { Incident } from '@csl/shared-types';

interface MediationPageProps {
  params: Promise<{ id: Incident['id'] }>;
}

export default async function MediationPage({ params }: MediationPageProps) {
  const { id } = await params;

  return (
    <>
      <h1>Mediation</h1>
      <p>Incident {id}</p>
    </>
  );
}
