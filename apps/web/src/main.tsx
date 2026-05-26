import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { initTheme } from '@ncaa/ui';
import '@ncaa/ui/styles.css';
import { App } from './App';
import './styles.css';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);
