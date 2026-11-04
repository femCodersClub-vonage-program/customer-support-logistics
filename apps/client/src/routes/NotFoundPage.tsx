import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
      <Link to="/orders">Go to my orders</Link>
    </main>
  );
}
