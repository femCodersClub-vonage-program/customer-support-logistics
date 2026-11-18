import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { RequireCustomer } from './auth/RequireCustomer.tsx';
import { DevPage } from './routes/DevPage.tsx';
import { IncidentPage } from './routes/IncidentPage.tsx';
import { LoginCallbackPage } from './routes/LoginCallbackPage.tsx';
import { LoginPage } from './routes/LoginPage.tsx';
import { NotFoundPage } from './routes/NotFoundPage.tsx';
import { OrdersPage } from './routes/OrdersPage.tsx';
import { ReportPage } from './routes/ReportPage.tsx';

const CallPage = lazy(() =>
  import('./routes/CallPage.tsx').then(({ CallPage }) => ({ default: CallPage })),
);

export function App() {
  return (
    <Routes>
      <Route index element={<Navigate to="/orders" replace />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="login/callback" element={<LoginCallbackPage />} />
      <Route element={<RequireCustomer />}>
        <Route path="orders" element={<OrdersPage />} />
        <Route path="report/:orderId" element={<ReportPage />} />
        <Route path="incidents/:id" element={<IncidentPage />} />
        <Route
          path="call/:id"
          element={
            <Suspense fallback={null}>
              <CallPage />
            </Suspense>
          }
        />
      </Route>
      {import.meta.env.DEV && <Route path="dev" element={<DevPage />} />}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
