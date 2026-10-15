import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { watchForUpdates } from './lib/autoUpdate.js';

if (import.meta.env.PROD) watchForUpdates();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
