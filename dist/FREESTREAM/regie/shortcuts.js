// Raccourcis clavier basés sur les réflexesuniversels.
import { SHORTCUTS } from '../core/config.js';

const typing = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function installShortcuts({ store, activeModule, actions }) {
  const map = { ...SHORTCUTS, ...(store.state.settings?.shortcuts || {}) };
  const handler = e => {
    const t = e.target;
    const key = e.key.length === 1 ? (e.shiftKey ? e.key.toUpperCase() : e.key.toLowerCase()) : e.key;

    // Ctrl+Z fonctionne partout, même dans un champ de saisie.
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'z' && !typing(t)) { e.preventDefault(); actions.undo(); return; }
    // Échap coupe / masque, même depuis un champ.
    if (key === 'Escape') { if (typing(t)) { t.blur(); return; } e.preventDefault(); actions.clear(); return; }
    if (typing(t)) return;                 // les modules gèrent leurs propres champs
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    let action = map[key] || map[e.key];
    if (!action) return;
    e.preventDefault();
    if (action === 'next' || action === 'prev' || action === 'confirm' || action === 'sendFullscreen' || action === 'sendLower') {
      activeModule()?.onKey?.(action);
      return;
    }
    if (action === 'clear') return actions.clear();
    if (action === 'blackout') return actions.blackout();
    if (action === 'previewFullscreen') return actions.preview('plein');
    if (action === 'previewLower') return actions.preview('bas');
    if (action === 'orateurMessage') return actions.goto('orateur');
    if (action.startsWith('tool:')) return actions.goto(action.slice(5));
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
