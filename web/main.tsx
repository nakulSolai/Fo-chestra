import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './accessibility.css';
import './refinements.css';
import './receipt-checks.css';
import './recording.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
