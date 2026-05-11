import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { store } from './store';
import './styles/tokens.css';
import './styles/global.css';
import { initI18n } from './i18n';
import { appRouter } from './router/AppRouter';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// QW-4 bonus: warm TCP/TLS to the API origin (Cloud Run) before the first XHR
// fires. Inject from JS instead of index.html so we can read VITE_API_URL —
// %ENV% substitution would have to handle the dev-empty case anyway.
const apiUrl = import.meta.env['VITE_API_URL'] as string | undefined;
if (apiUrl && /^https?:\/\//.test(apiUrl)) {
  try {
    const origin = new URL(apiUrl).origin;
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = origin;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
    const dnsPrefetch = document.createElement('link');
    dnsPrefetch.rel = 'dns-prefetch';
    dnsPrefetch.href = origin;
    document.head.appendChild(dnsPrefetch);
  } catch {
    // Malformed URL — silently skip the hint.
  }
}

// Blocking i18n init — useTranslation does NOT suspend by default in our
// react-i18next setup, so rendering before init returns raw keys (hero.title,
// CTA.REGISTER, …). Cost of awaiting ~150 ms is acceptable; can be revisited
// once we enable useSuspense in the i18n config.
initI18n().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <Provider store={store}>
        <Suspense fallback={null}>
          <RouterProvider router={appRouter} />
        </Suspense>
      </Provider>
    </StrictMode>,
  );
});
