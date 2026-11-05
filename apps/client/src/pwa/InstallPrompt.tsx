import { useInstallPrompt } from './installPrompt.ts';
import { useInterruptionsBlocked } from './interruptions.ts';
import './pwa.css';

function ShareIcon() {
  return (
    <svg
      className="install-prompt__icon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="20"
      height="20"
    >
      <path
        d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InstallPrompt() {
  const { mode, install, dismiss } = useInstallPrompt();
  const blocked = useInterruptionsBlocked();
  const visible = mode !== 'hidden' && !blocked;

  return (
    <div aria-live="polite">
      {visible && (
        <aside className="pwa-card" aria-labelledby="install-prompt-title">
          <h2 id="install-prompt-title" className="pwa-card__title">
            Install the app
          </h2>
          {mode === 'native' ? (
            <p>Add CSL to your home screen to follow your orders and incidents in one tap.</p>
          ) : (
            <ol className="install-prompt__steps">
              <li>
                Tap the Share button <ShareIcon /> in the Safari toolbar.
              </li>
              <li>Choose “Add to Home Screen”.</li>
            </ol>
          )}
          <div className="pwa-card__actions">
            {mode === 'native' && (
              <button type="button" className="pwa-button" onClick={() => void install()}>
                Install
              </button>
            )}
            <button type="button" className="pwa-button pwa-button--secondary" onClick={dismiss}>
              Not now
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
