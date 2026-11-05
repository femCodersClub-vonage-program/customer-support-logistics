import { notFound } from 'next/navigation';

import { ApiStatus } from '../../components/ApiStatus';

export default function DevPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <>
      <h1>Developer tools</h1>
      <ApiStatus />
    </>
  );
}
