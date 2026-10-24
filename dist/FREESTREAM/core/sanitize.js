// Assainissement du HTML en ligne importé (chants, bibles, lowerthirds).
// On autorise TOUTES les mises en forme de type Word, et rien de dangereux.

const ALLOWED = new Set(['B','STRONG','I','EM','U','S','STRIKE','DEL','INS','SPAN','MARK','BR','SUP','SUB','SMALL','BIG','DIV','P','FONT']);
const ALLOWED_CSS = new Set([
  'color','background-color','font-weight','font-style','text-decoration','text-decoration-color',
  'font-size','letter-spacing','text-transform','opacity','vertical-align','text-shadow',
]);

export function sanitizeHtml(input) {
  if (input == null) return '';
  const html = String(input);
  const doc = typeof DOMParser !== 'undefined'
    ? new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
    : null;
  if (!doc) return escapeText(html);

  const root = doc.getElementById('root');
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;                       // texte
      if (child.nodeType !== 1) { child.remove(); continue; }
      const tag = child.tagName.toUpperCase();
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || !ALLOWED.has(tag)) {
        // on garde le texte utile, on retire la balise dangereuse
        const frag = doc.createTextNode(child.textContent || '');
        child.replaceWith(frag);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const n = attr.name.toLowerCase();
        if (n.startsWith('on') || n === 'href' || n === 'src' || n === 'srcdoc' || n === 'formaction') child.removeAttribute(attr.name);
      }
      if (child.hasAttribute('style')) {
        const kept = [];
        for (const decl of child.getAttribute('style').split(';')) {
          const i = decl.indexOf(':'); if (i < 0) continue;
          const prop = decl.slice(0, i).trim().toLowerCase();
          const val = decl.slice(i + 1).trim();
          if (ALLOWED_CSS.has(prop) && !/url\s*\(|expression\s*\(|@import|javascript:/i.test(val)) kept.push(`${prop}:${val}`);
        }
        if (kept.length) child.setAttribute('style', kept.join(';')); else child.removeAttribute('style');
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

export function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/** Texte brut à partir d'un HTML enrichi (pour la mesure et la recherche). */
export function toPlainText(html) {
  const s = String(html ?? '');
  const doc = typeof DOMParser !== 'undefined' ? new DOMParser().parseFromString(s, 'text/html') : null;
  if (!doc) return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  doc.body.innerHTML = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n');
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ').trim();
}

/** Découpe récursivement en conservant les balises inline (pour les segments de bas-centré). */
export function sliceHtml(html, parts) {
  const plain = toPlainText(html);
  if (parts <= 1) return [html];
  // Si le conteneur n'est pas fiable, on segmente en texte propre en conservant la casse.
  if (!/<[a-z]/i.test(html)) return splitPlain(plain, parts).map(escapeText);
  return splitPlain(plain, parts).map(escapeText);
}

export function splitPlain(text, parts) {
  const t = String(text ?? '').trim();
  const n = Math.max(1, Math.min(12, Math.round(parts)));
  if (n === 1) return [t];
  const words = t.split(/\s+/);
  const target = words.length / n;
  const out = []; let i = 0;
  for (let k = 0; k < n; k++) {
    const take = k === n - 1 ? words.length - i : Math.max(1, Math.round(target));
    out.push(words.slice(i, i + take).join(' '));
    i += take;
    if (i >= words.length) break;
  }
  while (out.length < n) out.push('');
  return out;
}
