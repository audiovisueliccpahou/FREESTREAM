// Moteur de mesure de texte PARTAGÉ entre les aperçus et les sorties OBS.
// C'est la clé de l'exigence « aucun à-peu-près » : le même code calcule la mise
// en page dans la régie, dans la preview et dans OBS. Aucun calcul dépendant du zoom.

const CHAR_W = Object.freeze({
  narrow: 0.28,   // ilIfjlt.,:;'"!|()[]{}/\\ 
  wide:   0.86,   // MW@% 
  space:  0.27,
  digit:  0.55,
  upper:  0.66,
  lower:  0.53,
  accent: 0.55,
  cjk:    1.00,
});

function widthRatio(ch, fontWeight) {
  const bold = Number(fontWeight) >= 600 ? 1.045 : 1;
  if (ch === ' ') return CHAR_W.space;
  if (/[ilI fjlt.,:;'"!|()[\]{}/\\`´]/.test(ch)) return CHAR_W.narrow * bold;
  if (/[MW@%]/.test(ch)) return CHAR_W.wide * bold;
  if (/[0-9]/.test(ch)) return CHAR_W.digit * bold;
  if (/[A-Z]/.test(ch)) return CHAR_W.upper * bold;
  if (/[àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ]/.test(ch)) return CHAR_W.accent * bold;
  if (/[\u3000-\u9fff\uac00-\ud7af]/.test(ch)) return CHAR_W.cjk;
  return CHAR_W.lower * bold;
}

let _ctx = null, _ctxTried = false;
function realMeasure() {
  if (_ctxTried) return _ctx;
  _ctxTried = true;
  try {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    _ctx = c ? c.getContext('2d') : null;
    if (_ctx && typeof _ctx.measureText !== 'function') _ctx = null;
  } catch { _ctx = null; }
  return _ctx;
}

/** Largeur d'une ligne en pixels logiques. */
export function measureLine(text, style = {}) {
  const size = style.fontSize || 100;
  const ctx = realMeasure();
  if (ctx) {
    try {
      ctx.font = `${style.fontStyle || 'normal'} ${style.fontWeight || 400} ${size}px ${style.fontFamily || 'sans-serif'}`;
      const w = ctx.measureText(text).width;
      if (Number.isFinite(w) && w > 0) return w + (style.letterSpacing || 0) * text.length;
    } catch { /* repli ci-dessous */ }
  }
  let w = 0;
  for (const ch of String(text)) w += size * widthRatio(ch, style.fontWeight);
  return w + (style.letterSpacing || 0) * text.length;
}

/** Découpe un texte en lignes respectant la largeur de la zone (wrap mot par mot). */
export function wrapText(text, boxW, style = {}) {
  const paragraphs = String(text ?? '').split(/\r?\n/);
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(/(\s+)/).filter(w => w !== '');
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (line && measureLine(candidate, style) > boxW) {
        lines.push(line.trimEnd());
        line = word.trimStart();
        // Un mot unique plus long que la boîte → coupure dure
        while (measureLine(line, style) > boxW && line.length > 1) {
          let cut = 1;
          while (cut < line.length && measureLine(line.slice(0, cut + 1), style) <= boxW) cut++;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else line = candidate;
    }
    lines.push(line.trimEnd());
  }
  return lines.length ? lines : [''];
}

/** Nombre de lignes + hauteur occupée pour une taille donnée. */
export function layoutHeight(text, boxW, style = {}) {
  const n = wrapText(text, boxW, style).length;
  return n * (style.fontSize || 100) * (style.lineHeight || 1.15);
}

/**
 * Trouve la plus grande taille de police qui tient dans la zone, SANS jamais déborder.
 * Recherche dichotomique déterministe : même résultat en preview et dans OBS.
 */
export function fitFontSize(text, boxW, boxH, style = {}) {
  const max = style.fontSize || 200;
  const min = style.minFontSize ?? Math.max(12, Math.round(max * 0.30));
  const pad = style.padding || 0;
  const W = Math.max(1, boxW - pad * 2);
  const H = Math.max(1, boxH - pad * 2);
  const probe = s => {
    const st = { ...style, fontSize: s, letterSpacing: (style.letterSpacing || 0) * (s / max) };
    return layoutHeight(text, W, st) <= H + 0.5 && wrapText(text, W, st).every(l => measureLine(l, st) <= W + 0.5);
  };
  if (probe(max)) return max;
  if (!probe(min)) return { size: min, overflow: true };
  let lo = min, hi = max;
  for (let i = 0; i < 22 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (probe(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Découpe un verset long en N segments équilibrés sur les frontières de mots.
 * Utilisé pour « Esther 8:9 en 4 sections » en bas-centré.
 */
export function splitText(text, parts = 2) {
  const t = String(text ?? '').trim();
  const n = Math.max(1, Math.min(12, Math.round(parts)));
  if (n === 1 || !t) return [t];
  const target = t.length / n;
  const tokens = t.split(/(\s+)/);
  const out = [];
  let cur = '';
  for (const tok of tokens) {
    if (out.length < n - 1 && cur.length >= target && /^\s+$/.test(tok)) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += tok;
  }
  if (cur.trim()) out.push(cur.trim());
  while (out.length < n) out.push('');
  if (out.length > n) { const tail = out.splice(n - 1).join(' '); out[n - 1] = tail.trim(); }
  return out;
}

/** Nombre de segments conseillé selon la longueur (règle « Esther 8:9 → 4 »). */
export function partsForLength(text, maxChars = 150) {
  const len = String(text ?? '').trim().length;
  if (len <= maxChars) return 1;
  return Math.min(4, Math.ceil(len / maxChars));
}
