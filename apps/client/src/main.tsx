import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App.tsx';
import { LocaleProvider } from './i18n/LocaleProvider.tsx';
import { LocaleSwitcher } from './i18n/LocaleSwitcher.tsx';
import { listenForInstallPrompt } from './pwa/installPrompt.ts';
import { InterruptionsProvider } from './pwa/InterruptionsProvider.tsx';
import { OfflineBanner } from './pwa/OfflineBanner.tsx';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';
import './styles/tokens.css';
import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root not found');
}

listenForInstallPrompt();

createRoot(container).render(
  <StrictMode>
    <LocaleProvider>
      <InterruptionsProvider>
        <OfflineBanner />
        <LocaleSwitcher />
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <UpdatePrompt />
      </InterruptionsProvider>
    </LocaleProvider>
  </StrictMode>,
);
