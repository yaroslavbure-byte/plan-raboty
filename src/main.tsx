import { createRoot } from 'react-dom/client';
import '@fontsource/noto-serif/cyrillic-400.css';
import '@fontsource/noto-serif/latin-400.css';
import '@fontsource/noto-serif/cyrillic-500.css';
import '@fontsource/noto-sans/cyrillic-400.css';
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/cyrillic-500.css';
import './styles.css';
import App from './App';
import { init } from './store';
import { initTheme } from './theme';

if (window.planDesktop) document.documentElement.classList.add('is-desktop');
initTheme();
createRoot(document.getElementById('root')!).render(<App />);
init();
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.)/)) {
  navigator.serviceWorker.register('./sw.js');
}
