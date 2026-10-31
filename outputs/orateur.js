/** Vue ORATEUR (confidence monitor) : miroir plein écran + messages temporaires. */
import { store } from '../core/store.js';
import { Stage } from '../core/renderer.js';
import { mediaKind } from '../core/config.js';
import { sanitizeHtml, escapeText } from '../core/sanitize.js';

await store.init({ role: 'output', id: 'orateur' });
const root = document.getElementById('root');
const msgEl = document.getElementById('message');
const msgBody = document.getElementById('message-body');
const badge = document.getElementById('badge');
let stage = null, designId = null, designSignature = '', lastKey = '';
const signatureOf = d => { try { return JSON.stringify(d || null); } catch { return String(d?.id || ''); } };

function apply(s) {
  const p = s.live?.blackout ? null : s.live?.fullscreen;
  if (!p) { root.style.opacity = '0'; }
  else {
    const d = s.designs?.[p.designId] || s.designs?.[`${p.tool}:plein`];
    const signature = signatureOf(d);
    if (!stage || designId !== d?.id) { stage?.destroy(); stage = new Stage(root, { design: d }); designId = d?.id; designSignature = signature; lastKey = ''; }
    else if (designSignature !== signature) { stage.setDesign(d); designSignature = signature; lastKey = ''; }
    root.style.opacity = '1';
    const key = `${signature}|${p.key || JSON.stringify(p.vars)}`;
    if (key !== lastKey) {
      lastKey = key;
      const m = p.media || {};
      stage.update(p.vars || {}, { media: { src: m.src || '', kind: m.kind || mediaKind(m.src || ''), playing: m.playing ?? true, muted: true, currentTime: m.currentTime || 0, slide: m.slide || 0 } });
    }
  }

  // Message : 15 s par défaut, ou jusqu'à ce que la régie pasteur coupe.
  const o = s.orateur || {};
  const active = !!o.message && !o.cut && (Date.now() - (o.startedAt || 0) < (o.durationMs || 15000));
  document.body.classList.toggle('msg-active', active);
  if (active) {
    // Défense en profondeur : la régie assainit déjà, mais la sortie OBS ne doit
    // jamais faire confiance à un état venant du réseau, d'un fichier ou d'une API.
    const rich = o.message.html ? sanitizeHtml(o.message.html) : '';
    const safe = rich || escapeText(o.message.text ?? '');
    msgBody.innerHTML = `<div class="msg-icon">✉</div><div class="msg-text">${safe}</div>`;
    const left = Math.max(0, Math.ceil(((o.durationMs || 15000) - (Date.now() - o.startedAt)) / 1000));
    badge.textContent = `${left} s`;
    badge.style.display = o.showPip === false ? 'none' : '';
  } else badge.style.display = 'none';
}

function escape(t) { return String(t).replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c])); }
store.on(apply); apply(store.state);
setInterval(() => apply(store.state), 250);
