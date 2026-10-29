import { render } from 'preact';
import { TvApp } from '@iptvnator/tv/feature';
import './theme.css';
import './live-overlay.css';
import './programme-guide.css';
import './grid-guide.css';
import './settings.css';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing TV application root');
}

window.onerror = (message, source, line, column, error) => {
  root.innerHTML = '';
  const box = document.createElement('pre');
  box.style.cssText =
    'color:white;background:#202020;padding:30px;font-size:20px;white-space:pre-wrap;';
  box.textContent =
    'ERREUR VIEIRUSTV\n' +
    String(message) +
    '\nLigne : ' +
    line +
    '\n' +
    (error?.stack || '');
  document.body.appendChild(box);
  return true;
};

try {
const diagnostic = document.createElement('div');
diagnostic.textContent = 'VieirusTV : lancement de TvApp...';
diagnostic.style.cssText =
    'position:fixed;top:0;left:0;z-index:99999;color:white;background:#333;padding:20px;font-size:24px;';
document.body.appendChild(diagnostic);
  render(<TvApp />, root);
} catch (error) {
  root.innerHTML = '';
  const box = document.createElement('pre');
  box.style.cssText =
    'color:white;background:#202020;padding:30px;font-size:20px;white-space:pre-wrap;';
  box.textContent =
    'ERREUR AU DEMARRAGE\n' +
    (error instanceof Error ? error.stack : String(error));
  document.body.appendChild(box);
}