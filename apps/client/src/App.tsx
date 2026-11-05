import { Navigate, Route, Routes } from 'react-router';

import { CallPage } from './routes/CallPage.tsx';
import { DevPage } from './routes/DevPage.tsx';
import { IncidentPage } from './routes/IncidentPage.tsx';
import { LoginPage } from './routes/LoginPage.tsx';
import { NotFoundPage } from './routes/NotFoundPage.tsx';
import { OrdersPage } from './routes/OrdersPage.tsx';
import { ReportPage } from './routes/ReportPage.tsx';

export function App() {
  return (
    <Routes>
      <Route index element={<Navigate to="/orders" replace />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="report/:orderId" element={<ReportPage />} />
      <Route path="incidents/:id" element={<IncidentPage />} />
      <Route path="call/:id" element={<CallPage />} />
      {import.meta.env.DEV && <Route path="dev" element={<DevPage />} />}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
