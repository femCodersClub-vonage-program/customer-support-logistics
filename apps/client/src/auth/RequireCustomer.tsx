import { Navigate, Outlet, useLocation } from 'react-router';

import { useSession } from './session-context.ts';

export function RequireCustomer() {
  const { state } = useSession();
  const location = useLocation();

  if (state.status === 'loading') {
    return null;
  }

  if (state.user?.role !== 'customer') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);

    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}
