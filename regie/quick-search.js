// Recherche unifiée de la régie — méthode OpenPresenter, adaptée à FREESTREAM.
// La recherche prépare un élément dans la régie ; elle ne le diffuse JAMAIS
// toute seule. Le direct reste une action explicite (F/S, bouton Envoyer, 2e clic média).
import { store } from './core.js';
import { getBook, parseReference, searchBooks, formatRef } from '../core/bible-utils.js';
import { getVerse, listVersions } from '../core/bible-data.js';
import { songPlain } from '../core/songs-utils.js';
import { mediaKind } from '../core/config.js';

const normalize = value => String(value ?? '').toLocaleLowerCase('fr')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let library = null;
let libraryAt = 0;
let versionCache = null;
let versionCacheAt = 0;
const bibleIndexes = new Map();

async function getVersions() {
  if (versionCache && Date.now() - versionCacheAt < 15000) return versionCache;
  versionCache = await listVersions(store);
  versionCacheAt = Date.now();
  return versionCache;
}

async function loadLibrary() {
  if (library && Date.now() - libraryAt < 2500) return library;
  const [songFiles, mediaFiles] = await Promise.all([store.list('chants'), store.list('medias')]);
  const songs = [];
  for (const f of songFiles.filter(x => /\.json$/i.test(x.name))) {
    try {
      const song = await store.load('chants', f.name);
      if (song?.sections) songs.push({ id: song.id, title: song.title || f.name, text: songPlain(song), file: f.name });
    } catch { }
  }
  const links = store.state.medias?.links || [];
  const media = [
    ...mediaFiles.map(f => ({ id: 'f:' + f.name, name: f.name, kind: mediaKind(f.name), source: 'fichier' })),
    ...links.map(x => ({ id: 'l:' + x.id, name: x.name || x.url, kind: 'lien', source: 'lien' })),
  ];
  library = { songs, media };
  libraryAt = Date.now();
  return library;
}

async function bibleIndex() {
  const versionId = store.state.bible?.version;
  if (!versionId) return [];
  if (bibleIndexes.has(versionId)) return bibleIndexes.get(versionId);
  const versions = await getVersions();
  const v = versions.find(x => x.id === versionId) || versions[0];
  if (!v?.dataset?.books) return [];
  const rows = [];
  for (const [book, chapters] of Object.entries(v.dataset.books)) {
    for (const [chapter, verses] of Object.entries(chapters)) {
      for (const [verse, text] of Object.entries(verses)) {
        const value = String(text);
        rows.push({ book, chapter: +chapter, verse: +verse, text: value, searchText: normalize(value) });
      }
    }
  }
  bibleIndexes.set(versionId, rows);
  return rows;
}

export async function searchAll(query, limit = 12) {
  const raw = String(query || '').trim();
  const q = normalize(raw);
  if (q.length < 2) return [];
  const out = [];
  const ref = /\d/.test(raw) ? parseReference(raw) : null;
  const bookToken = raw.match(/^\s*(?:\d\s*)?[A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+)*?(?=\s*\d)/)?.[0]?.trim();
  const directBook = bookToken ? getBook(bookToken) : null;

  if (ref?.bookName && directBook) {
    const versions = await getVersions();
    const version = versions.find(x => x.id === store.state.bible?.version) || versions[0];
    const text = version ? getVerse(version.dataset, ref.bookName, ref.chapter, ref.verse) : null;
    out.push({
      type: 'bible', icon: '📖', title: formatRef(ref.bookName, ref.chapter, ref.verse, ref.toVerse),
      detail: text || 'Ouvrir cette référence dans la Bible',
      action: { book: ref.bookName, chapter: ref.chapter, verse: ref.verse, toVerse: ref.toVerse || null },
    });
  }

  // Recherche plein texte dans la version sélectionnée, indexée une seule fois.
  if (!ref?.bookName && q.length >= 3) {
    const rows = await bibleIndex();
    const terms = q.split(/\s+/).filter(x => x.length > 1);
    const hits = [];
    for (const row of rows) {
      const text = row.searchText;
      if (text.includes(q) || (terms.length > 1 && terms.every(term => text.includes(term)))) {
        hits.push(row);
        if (hits.length >= 5) break;
      }
    }
    for (const hit of hits) out.push({
      type: 'bible', icon: '📖', title: formatRef(hit.book, hit.chapter, hit.verse),
      detail: hit.text, action: { book: hit.book, chapter: hit.chapter, verse: hit.verse },
    });
  }

  // Suggestions de livres pour les saisies courtes, sans résultats flous éloignés.
  if (!ref?.bookName && q.length >= 2 && q.length <= 5) {
    const candidates = searchBooks(raw, 5).filter(b => normalize([b.name, ...b.aliases].join(' ')).includes(q.replace(/ /g, '')));
    for (const book of candidates) {
      if (out.some(x => x.action?.book === book.name)) continue;
      out.push({ type: 'bible-book', icon: '📖', title: book.name, detail: `${book.chapters} chapitres · ouvrir la Bible`, action: { book: book.name, chapter: 1, verse: 1 } });
    }
  }

  const { songs, media } = await loadLibrary();
  for (const song of songs) {
    const title = normalize(song.title), body = normalize(song.text);
    if (title.includes(q) || body.includes(q)) out.push({
      type: 'song', icon: '🎤', title: song.title,
      detail: body.includes(q) ? 'Correspondance dans les paroles' : 'Chant · ouvrir la bibliothèque',
      action: { id: song.id },
    });
    if (out.filter(x => x.type === 'song').length >= 5) break;
  }
  for (const item of media) {
    if (normalize(item.name).includes(q)) out.push({
      type: 'media', icon: item.kind === 'image' ? '🖼️' : item.kind === 'video' ? '🎞️' : '📁',
      title: item.name, detail: `${item.source} · ${item.kind} · 1 clic aperçu / 2 clics OBS`, action: { id: item.id },
    });
    if (out.filter(x => x.type === 'media').length >= 5) break;
  }
  return out.slice(0, limit);
}

export function invalidateSearchIndex() {
  library = null;
  libraryAt = 0;
  versionCache = null;
  versionCacheAt = 0;
  bibleIndexes.clear();
}

export { normalize as normalizeSearchText };
