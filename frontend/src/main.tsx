import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useSettingsStore } from './state/store.js';
import './index.css';
import '@xyflow/react/dist/style.css';

function Bootstrap() {
  useEffect(() => {
    useSettingsStore.getState().load();
  }, []);
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
