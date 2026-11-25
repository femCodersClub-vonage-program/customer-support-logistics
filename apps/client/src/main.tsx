import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App.tsx';
import { SessionProvider } from './auth/session.tsx';
import { LocaleProvider } from './i18n/LocaleProvider.tsx';
import { LocaleSwitcher } from './i18n/LocaleSwitcher.tsx';
import { listenForInstallPrompt } from './pwa/installPrompt.ts';
import { InterruptionsProvider } from './pwa/InterruptionsProvider.tsx';
import { OfflineBanner } from './pwa/OfflineBanner.tsx';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';
import { shouldRetry } from './query-retry.ts';
import '@csl/design-tokens';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root not found');
}

listenForInstallPrompt();

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <InterruptionsProvider>
          <OfflineBanner />
          <LocaleSwitcher />
          <BrowserRouter>
            <SessionProvider>
              <App />
            </SessionProvider>
          </BrowserRouter>
          <UpdatePrompt />
        </InterruptionsProvider>
      </LocaleProvider>
    </QueryClientProvider>
  </StrictMode>,
);
