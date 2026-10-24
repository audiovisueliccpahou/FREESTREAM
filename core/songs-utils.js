// FREESTREAM — chants : analyse, découpage, import/export multi-formats.
// RÈGLE MÉTIER : un seul retour = même section (lignes distinctes).
//                 deux retours (ligne vide) = nouvelle section.

import { uid } from './defaults.js';
import { toPlainText } from './sanitize.js';

const LABEL_RE = /^\s*(?:\(?\s*)?(couplet|verse|refrain|chorus|pré[- ]?refrain|pre[- ]?chorus|pont|bridge|intro|outro|fin|ending|tag|interlude|solo|strophe)\s*(\d+|[a-z])?\s*\)?\s*[:.\-]?\s*$/i;
const CHORDPRO_META = /^\{\s*([\w-]+)\s*:\s*(.*?)\s*\}\s*$/;

export const SECTION_LABELS = ['Couplet', 'Refrain', 'Pré-refrain', 'Pont', 'Intro', 'Outro', 'Tag', 'Interlude', 'Fin'];

/** Analyse un texte brut en sections/lignes. */
export function parseSong(raw, title = '') {
  const text = String(raw ?? '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const sections = [];
  let autoTitle = title;
  const meta = {};

  for (const block of blocks) {
    const lines = [];
    let label = null;
    const chords = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trimEnd();
      if (!line.trim()) continue;
      const cm = CHORDPRO_META.exec(line);
      if (cm) {
        const k = cm[1].toLowerCase();
        if (k === 'title' || k === 't') autoTitle = cm[2] || autoTitle;   // titre explicite prioritaire
        else meta[k] = cm[2];
        continue;
      }
      if (LABEL_RE.test(line) && !label && lines.length === 0) { label = capLabel(line); continue; }
      // Accords ChordPro [C] : on les garde à part, le texte projeté reste propre.
      if (/\[[A-G][#b]?m?\d*\]/.test(line)) {
        chords.push(line);
        const lyrics = line.replace(/\[[^\]]+\]/g, '').trim();
        if (lyrics) lines.push(lyrics);
      } else lines.push(line);
    }
    if (lines.length) sections.push({ id: uid('sec'), label: label || '', lines, chords });
  }
  return {
    id: uid('song'), title: autoTitle.trim() || 'Sans titre',
    sections, meta, createdAt: Date.now(), updatedAt: Date.now(),
    tags: [], author: meta.author || meta.artist || '', key: meta.key || '',
  };
}

function capLabel(s) {
  const m = LABEL_RE.exec(s);
  if (!m) return s;
  const map = { verse:'Couplet', chorus:'Refrain', bridge:'Pont', 'pre-refrain':'Pré-refrain', 'pre-chorus':'Pré-refrain', ending:'Fin' };
  const base = map[m[1].toLowerCase().replace(/\s+/g,'-')] || m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  return base + (m[2] ? ' ' + m[2] : '');
}

/** Reserialize en texte (deux retours entre sections). */
export function serializeSong(song) {
  return (song.sections || []).map(s => {
    const head = s.label ? `${s.label}\n` : '';
    return head + (s.lines || []).join('\n');
  }).join('\n\n');
}

/**
 * Découpe une section en écrans de N lignes pour que le texte reste TOUJOURS
 * en grands caractères, même si l'opérateur a saisi de petits caractères.
 */
export function chunkSection(section, linesPerChunk = 4) {
  const lines = section?.lines || [];
  const n = Math.max(1, Math.min(12, Number(linesPerChunk) || 4));
  const out = [];
  for (let i = 0; i < lines.length; i += n) {
    const slice = lines.slice(i, i + n);
    out.push({
      text: slice.join('\n'),
      label: section.label || '',
      index: out.length,
      total: Math.ceil(lines.length / n),
      sectionIndex: section.index,
    });
  }
  return out.length ? out : [{ text: '', label: section.label || '', index: 0, total: 1 }];
}

/** Liste à plat de tous les écrans d'un chant (pour navigation clavier). */
export function allSlides(song, linesPerChunk = 4) {
  const out = [];
  (song.sections || []).forEach((s, si) => {
    for (const c of chunkSection({ ...s, index: si }, linesPerChunk)) out.push({ ...c, sectionIndex: si, globalIndex: out.length });
  });
  return out;
}

export function songPlain(song) {
  return toPlainText((song.sections || []).map(s => [s.label, ...(s.lines || [])].filter(Boolean).join('\n')).join('\n\n'));
}

/** Recherche « intelligente » : quelques mots du contenu suffisent. */
export function searchSongs(songs, query, limit = 20) {
  const q = String(query || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!q) return songs.slice(0, limit);
  const words = q.split(/\s+/).filter(Boolean);
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return songs.map(s => {
    const t = songPlain(s), title = norm(s.title), body = norm(t);
    let score = 0;
    if (title.startsWith(q)) score += 20;
    else if (title.includes(q)) score += 12;
    if (body.includes(q)) score += 8;
    for (const w of words) {
      if (title.includes(w)) score += 4;
      if (body.includes(w)) score += 2;
      else if (w.length > 3 && body.includes(w.slice(0, w.length - 2))) score += 1;
    }
    const snippet = findSnippet(t, q);
    return { ...s, score, snippet };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
function findSnippet(text, q) {
  const i = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').indexOf(q);
  if (i < 0) return (text.split('\n').find(Boolean) || '').slice(0, 90);
  return '…' + text.slice(Math.max(0, i - 25), i + 70).replace(/\n/g, ' / ') + '…';
}

/* --------------------------------------------------------------- import */
export function importSong(text, filename = '') {
  const t = String(text || '').trim();
  if (!t) throw new Error('Fichier vide');
  const lower = filename.toLowerCase();

  // ChordPro commence par {title: …} : le détecter AVANT le JSON (sinon confusion).
  if (/\{\s*(title|t)\s*:/i.test(t) || lower.endsWith('.cho') || lower.endsWith('.chopro') || lower.endsWith('.crd')) {
    const s = parseSong(t, '');
    if (!s.title || s.title === 'Sans titre') s.title = cleanName(filename);
    return s;
  }

  let d = null;
  if (t.startsWith('{') || t.startsWith('[') || lower.endsWith('.json')) {
    try { d = JSON.parse(t); } catch { d = null; }
  }
  if (d) {
    // FreeShow
    if (Array.isArray(d.slides) || Array.isArray(d.layouts)) {
      const sections = (d.slides || []).map(s => ({
        id: uid('sec'), label: s.label || s.group || '',
        lines: flattenItems(s.items || s.children || []),
      }));
      return normalizeSong({ title: d.title || d.name || cleanName(filename), sections, meta: { source: 'FreeShow' } });
    }
    // FREESTREAM natif
    if (Array.isArray(d.sections)) return normalizeSong({ ...d, id: uid('song') });
    // Objet { titre, paroles } / { title, lyrics }
    const title = d.title || d.titre || d.name || cleanName(filename);
    const lyrics = d.lyrics || d.paroles || d.text || d.content || '';
    if (lyrics) return parseSong(String(lyrics), title);
    throw new Error('JSON de chant non reconnu');
  }

  // ProPresenter 5/6 (XML)
  if (/<RVPresentationDocument|<rvPresentationDocument|<presentation/i.test(t)) {
    const doc = new DOMParser().parseFromString(t, 'application/xml');
    const groups = [...doc.querySelectorAll('RVSlideGroup, slideGroup')];
    const sections = [];
    for (const g of groups) {
      const label = g.getAttribute('name') || '';
      const lines = [];
      for (const s of g.querySelectorAll('RVTextElement, textElement')) {
        const raw = s.getAttribute('RTFData') || s.textContent || '';
        const plain = decodeRtf(raw);
        if (plain.trim()) lines.push(...plain.split('\n').filter(Boolean));
      }
      if (lines.length) sections.push({ id: uid('sec'), label, lines });
    }
    if (sections.length) return normalizeSong({ title: doc.documentElement.getAttribute('name') || cleanName(filename), sections, meta: { source: 'ProPresenter' } });
  }

  // OpenSong / VideoPsalm (XML)
  if (/<song|<lyrics|<SLIDE/i.test(t)) {
    const doc = new DOMParser().parseFromString(t, 'application/xml');
    const title = doc.querySelector('title')?.textContent || cleanName(filename);
    const lyrics = doc.querySelector('lyrics')?.textContent || '';
    const slides = [...doc.querySelectorAll('SLIDE')].map(s => s.textContent || '').filter(Boolean);
    const raw = lyrics || slides.join('\n\n');
    if (raw.trim()) return parseSong(raw.replace(/\[[^\]]+\]/g, ''), title);
  }

  // Texte brut
  return parseSong(t, cleanName(filename));
}

export function importMany(text, filename = '') {
  const t = String(text || '');
  // Plusieurs chants séparés par une ligne de tirets ou "==="
  const parts = t.split(/\n\s*(?:={3,}|-{5,}|\*{5,})\s*\n/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts.map((p, i) => importSong(p, `chant-${i+1}.txt`));
  return [importSong(t, filename)];
}

function flattenItems(items) {
  const out = [];
  for (const it of items) {
    if (typeof it === 'string') { out.push(...it.split('\n')); continue; }
    if (it?.text) out.push(...String(it.text).split('\n'));
    if (it?.lines) out.push(...it.lines.map(l => typeof l === 'string' ? l : (l.text || '')));
    if (it?.items) out.push(...flattenItems(it.items));
  }
  return out.filter(Boolean);
}
/** Exporté pour les tests : fonctionne à l'identique dans Node et dans le navigateur. */
export function decodeRtf(s) {
  if (!/\\rtf/i.test(s)) return s;
  // Décodage 100 % navigateur : pas de Buffer (indisponible dans un navigateur).
  // Les séquences \'xx sont des octets latin1 ; on gère aussi \uNNNN? (Unicode RTF).
  let out = s.replace(/\\u(-?\d+)\??/gi, (_, n) => {
    const cp = parseInt(n, 10);
    const v = cp < 0 ? cp + 65536 : cp;
    try { return String.fromCodePoint(v); } catch { return ''; }
  });
  out = out.replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return out
    .replace(/\\par[d]?\b/gi, '\n')
    .replace(/\\line\b|\\tab\b/gi, (m) => m.toLowerCase() === '\\tab' ? '\t' : '\n')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '')
    .trim();
}
function cleanName(f) { return String(f || 'Chant importé').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim(); }
function normalizeSong(s) {
  return { id: uid('song'), title: s.title || 'Sans titre', sections: (s.sections || []).map(x => ({ id: x.id || uid('sec'), label: x.label || '', lines: x.lines || [], chords: x.chords || [] })), meta: s.meta || {}, tags: s.tags || [], author: s.author || '', key: s.key || '', createdAt: Date.now(), updatedAt: Date.now() };
}

/* --------------------------------------------------------------- export */
export function exportSong(song, format = 'json') {
  if (format === 'txt') return `${song.title}\n\n${serializeSong(song)}`;
  if (format === 'chordpro') {
    const head = [`{title: ${song.title}}`, song.author && `{artist: ${song.author}}`, song.key && `{key: ${song.key}}`].filter(Boolean).join('\n');
    return head + '\n\n' + (song.sections || []).map(s => (s.label ? `{comment: ${s.label}}\n` : '') + (s.lines || []).join('\n')).join('\n\n');
  }
  if (format === 'freeshow') return JSON.stringify({ title: song.title, slides: (song.sections || []).map(s => ({ group: s.label, items: [{ type: 'text', lines: s.lines }] })) }, null, 2);
  return JSON.stringify(song, null, 2);
}
