import { Outlet } from 'react-router';

import { CustomerNav } from './CustomerNav.tsx';
import './navigation.css';

export function CustomerLayout() {
  return (
    <div className="customer-shell">
      <Outlet />
      <CustomerNav />
    </div>
  );
}
