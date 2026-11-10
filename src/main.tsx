import './style.css';

import { createRoot } from 'react-dom/client';

import { App } from './App';

const appElement = document.getElementById('app');
if (!appElement) throw new Error('Élément racine de l’application manquant : #app');

createRoot(appElement).render(<App />);
