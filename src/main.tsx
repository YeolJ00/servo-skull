import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App.tsx';
import { applyTheme, readTheme } from './app/theme.ts';
import './styles/base.css';

applyTheme(readTheme());

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root');
render(<App />, root);

// Offline support. New versions install on the next load.
registerSW({ immediate: true });
