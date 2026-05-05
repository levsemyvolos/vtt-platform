import { StrictMode } from 'react';
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

initI18n().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <Provider store={store}>
        <RouterProvider router={appRouter} />
      </Provider>
    </StrictMode>,
  );
});
