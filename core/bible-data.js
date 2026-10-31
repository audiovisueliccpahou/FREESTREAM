// Chargement, import et API des versions bibliques.
import { BOOKS, getBook, formatRef, verseCountFromDataset } from './bible-utils.js';

const memCache = new Map();

export async function listVersions(store) {
  const files = await store.list('bibles');
  const out = [];
  for (const f of files.filter(x => /\.json$/i.test(x.name))) {
    try {
      const d = await store.load('bibles', f.name);
      const meta = d?._meta || {};
      out.push({ id: meta.id || f.name.replace(/\.json$/i, ''), name: meta.name || f.name, short: meta.short || '', lang: meta.lang || 'fr', file: f.name, dataset: d });
    } catch { }
  }
  return out;
}

export async function loadVersion(store, id) {
  if (memCache.has(id)) return memCache.get(id);
  const all = await listVersions(store);
  const v = all.find(x => x.id === id) || all[0];
  if (v) memCache.set(id, v);
  return v || null;
}

export function getVerse(dataset, bookName, chapter, verse) {
  return dataset?.books?.[bookName]?.[String(chapter)]?.[String(verse)] ?? null;
}

export function getRange(dataset, bookName, chapter, from, to) {
  const out = [];
  for (let v = from; v <= to; v++) {
    const t = getVerse(dataset, bookName, chapter, v);
    if (t) out.push({ verse: v, text: t });
  }
  return out;
}

export function verseCount(dataset, book, chapter) {
  return verseCountFromDataset(dataset, book, chapter);
}

export function refKey(versionId, ref) {
  return `${versionId}|${formatRef(ref.book, ref.chapter, ref.verse, ref.toVerse)}`;
}

/* --------------------------------------------------------------- import */
/** Détecte et convertit les formats de Bible les plus courants. */
export function importBible(text, filename = '') {
  const t = String(text || '').trim();
  if (!t) throw new Error('Fichier vide');
  const lower = filename.toLowerCase();

  // 1) JSON natif FREESTREAM
  if (t.startsWith('{') || lower.endsWith('.json')) {
    const d = JSON.parse(t);
    if (d.books) return normalize(d, d._meta || {});
    // 2) JSON plat  { "Jean 3:16": "..." }  ou  [ {book,chapter,verse,text} ]
    const books = {};
    if (Array.isArray(d)) for (const r of d) push(books, r.book, r.chapter, r.verse, r.text);
    else for (const [k, v] of Object.entries(d)) {
      const m = /^(.+?)\s+(\d+):(\d+)$/.exec(k);
      if (m && typeof v === 'string') push(books, m[1], m[2], m[3], v);
    }
    if (Object.keys(books).length) return normalize({ books }, { name: filename || 'Bible importée' });
  }

  // 3) CSV : livre;chapitre;verset;texte  (ou , et tab)
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || /^(livre|book)[;,|\t]/i.test(t)) {
    const sep = t.split('\n')[0].includes(';') ? ';' : t.split('\n')[0].includes('\t') ? '\t' : ',';
    const books = {};
    for (const line of t.split(/\r?\n/).slice(1)) {
      const cols = line.split(sep);
      if (cols.length >= 4) push(books, clean(cols[0]), clean(cols[1]), clean(cols[2]), cols.slice(3).join(sep));
    }
    if (Object.keys(books).length) return normalize({ books }, { name: filename || 'Bible CSV' });
  }

  // 4) USFM : \id GEN  \c 1  \v 1 Au commencement...
  if (/\\id\s|\\c\s+\d/.test(t)) {
    const books = {};
    let book = '', chapter = 1;
    for (const line of t.split(/\r?\n/)) {
      const id = /\\id\s+([A-Z0-9]+)/.exec(line); if (id) { book = fromUsfmCode(id[1]); continue; }
      const c = /\\c\s+(\d+)/.exec(line); if (c) { chapter = +c[1]; continue; }
      const v = /\\v\s+(\d+)\s*(.*)$/.exec(line);
      if (v && book) push(books, book, chapter, +v[1], v[2].replace(/\\[a-z]+\*?/gi, '').replace(/\s+/g, ' ').trim());
    }
    if (Object.keys(books).length) return normalize({ books }, { name: filename || 'Bible USFM' });
  }

  // 5) OpenPresenter Bible XML (bible/testament/book number/chapter/verse).
  // OpenPresenter ships this five-level shape in BIBLES/*.xml. The number
  // attribute follows the standard 66-book order; translation/license/link
  // metadata are carried into FREESTREAM instead of being discarded.
  if (/<(osis|XMLBIBLE|bible)/i.test(t)) {
    const books = {};
    const doc = new DOMParser().parseFromString(t, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML illisible : vérifiez l’encodage et la syntaxe du fichier.');
    const root = doc.documentElement;
    const rootName = String(root?.localName || root?.nodeName || '').toLowerCase();
    const openBookNodes = [...doc.getElementsByTagName('*')].filter(n =>
      String(n.localName || n.nodeName).toLowerCase() === 'book' &&
      String(n.parentElement?.localName || n.parentElement?.nodeName || '').toLowerCase() === 'testament');
    if (rootName === 'bible' && openBookNodes.length) {
      const child = (node, name) => [...node.children].filter(x => String(x.localName||x.nodeName).toLowerCase() === name);
      for (const bn of openBookNodes) {
        const rawNumber = Number(bn.getAttribute('number') || bn.getAttribute('bnumber'));
        const named = bn.getAttribute('name') || bn.getAttribute('bname') || '';
        const book = (rawNumber > 0 && BOOKS[rawNumber-1]?.name) || getBook(named)?.name || named;
        if (!book) continue;
        for (const ch of child(bn,'chapter')) {
          const chapter = ch.getAttribute('number') || ch.getAttribute('cnumber');
          for (const verse of child(ch,'verse')) {
            const number = verse.getAttribute('number') || verse.getAttribute('vnumber');
            const text = [...verse.childNodes].map(n => n.textContent || '').join('').replace(/\s+/g,' ').trim();
            if (chapter && number && text) push(books,book,chapter,number,text);
          }
        }
      }
      if (Object.keys(books).length) {
        const translation=root.getAttribute('translation')||filename||'Bible OpenPresenter';
        const status=root.getAttribute('status')||'Licence non précisée dans le fichier source';
        const link=root.getAttribute('link')||'';
        return normalize({books},{
          id:`op-${slugId(translation)}`,name:translation,short:openPresenterShort(translation),
          lang:/\b(english|king james|kjv)\b/i.test(translation)?'en':'fr',license:status,
          source:'OpenPresenter XML',sourceLink:link,
        });
      }
    }

    // 6) OSIS / Zefania / generic XML.
    const bnodes = [...doc.querySelectorAll('div[type="book"], BIBLEBOOK')];
    for (const bn of bnodes) {
      const rawBook = bn.getAttribute('osisID') || bn.getAttribute('bname') || bn.getAttribute('bnumber') || '';
      const rawNum = Number(bn.getAttribute('bnumber')||'');
      const name = (rawNum>0&&BOOKS[rawNum-1]?.name) || fromUsfmCode(String(rawBook).split('.')[0]) || getBook(rawBook)?.name || rawBook;
      const verses = bn.querySelectorAll('verse[osisID], VERSE, VERS');
      let ch = 1;
      for (const v of verses) {
        const osis = v.getAttribute('osisID') || '';
        const mm = /\.(\d+)\.(\d+)/.exec(osis);
        if (mm) ch = +mm[1];
        const num = v.getAttribute('vnumber') || v.getAttribute('number') || (mm ? mm[2] : null) || '1';
        const chapterNode=v.closest('CHAPTER, chapter');
        ch=Number(chapterNode?.getAttribute('cnumber')||chapterNode?.getAttribute('number')||ch)||ch;
        push(books, name, ch, num, (v.textContent || '').replace(/\s+/g,' ').trim());
      }
    }
    if (Object.keys(books).length) return normalize({ books }, { name: filename || root?.getAttribute?.('translation') || 'Bible XML', source:'XML' });
  }

  // 6) TXT simple : "Jean 3:16 Car Dieu..." par ligne
  {
    const books = {};
    let n = 0;
    for (const line of t.split(/\r?\n/)) {
      const m = /^(.+?)\s+(\d+):(\d+)\s+(.+)$/.exec(line.trim());
      if (m) { push(books, m[1], m[2], m[3], m[4]); n++; }
    }
    if (n) return normalize({ books }, { name: filename || 'Bible TXT' });
  }
  throw new Error('Format non reconnu. Formats acceptés : JSON, CSV/TSV, USFM, OSIS/Zefania XML, TXT « Livre c:v texte ».');
}


function slugId(s) {
  const slug=String(s||'bible').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42);
  return slug||'version';
}
function openPresenterShort(name) {
  const s=String(name||'');
  if(/\bKJV|King James/i.test(s))return 'KJV';
  if(/\bBDS|Semeur/i.test(s))return 'BDS';
  if(/PDV.?2017|Parole de Vie/i.test(s))return 'PDV 2017';
  if(/\bS21|Segond 21/i.test(s))return 'S21';
  if(/Segond 1910|LSG/i.test(s))return 'LS1910';
  return s.slice(0,14);
}

function push(books, book, chapter, verse, text) {
  if (!book || !text) return;
  const b = getBook(String(book))?.name || String(book);
  (books[b] ||= {});
  (books[b][String(chapter)] ||= {})[String(verse)] = String(text).trim();
}
function clean(s) { return String(s || '').replace(/^["']|["']$/g, '').trim(); }
function normalize(d, meta) {
  return { ...d, _meta: { id: meta.id || 'imp-' + Date.now().toString(36), name: meta.name || 'Bible importée', short: meta.short || '', lang: meta.lang || 'fr', license: meta.license || 'Import local', ...meta } };
}
const USFM_CODES = { GEN:'Genèse',EXO:'Exode',LEV:'Lévitique',NUM:'Nombres',DEU:'Deutéronome',JOS:'Josué',JDG:'Juges',RUT:'Ruth','1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Rois','2KI':'2 Rois','1CH':'1 Chroniques','2CH':'2 Chroniques',EZR:'Esdras',NEH:'Néhémie',EST:'Esther',JOB:'Job',PSA:'Psaumes',PRO:'Proverbes',ECC:'Ecclésiaste',SNG:'Cantique des Cantiques',ISA:'Ésaïe',JER:'Jérémie',LAM:'Lamentations',EZK:'Ézéchiel',DAN:'Daniel',HOS:'Osée',JOL:'Joël',AMO:'Amos',OBA:'Abdias',JON:'Jonas',MIC:'Michée',NAM:'Nahum',HAB:'Habakuk',ZEP:'Sophonie',HAG:'Aggée',ZEC:'Zacharie',MAL:'Malachie',MAT:'Matthieu',MRK:'Marc',LUK:'Luc',JHN:'Jean',ACT:'Actes',ROM:'Romains','1CO':'1 Corinthiens','2CO':'2 Corinthiens',GAL:'Galates',EPH:'Éphésiens',PHP:'Philippiens',COL:'Colossiens','1TH':'1 Thessaloniciens','2TH':'2 Thessaloniciens','1TI':'1 Timothée','2TI':'2 Timothée',TIT:'Tite',PHM:'Philémon',HEB:'Hébreux',JAS:'Jacques','1PE':'1 Pierre','2PE':'2 Pierre','1JN':'1 Jean','2JN':'2 Jean','3JN':'3 Jean',JUD:'Jude',REV:'Apocalypse' };
function fromUsfmCode(c) { return USFM_CODES[String(c).toUpperCase()] || null; }

/* ------------------------------------------------- API gratuite (optionnelle) */
/**
 * Récupère un verset depuis une API gratuite quand Internet est disponible.
 * 100 % optionnel : en offline, on garde la version locale et on le signale.
 * Résultat mis en cache dans donnees/bibles/ via le store.
 */
export async function fetchOnlineVerse(ref, { translation = 'ls1910', store = null, timeout = 6000 } = {}) {
  const book = getBook(ref.book);
  if (!book) return null;
  const q = `${encodeURIComponent(ref.book)} ${ref.chapter}:${ref.verse}`;
  const urls = [
    `https://bible-api.com/data/${translation}/${encodeURIComponent(q)}`,
    `https://bible-api.com/${encodeURIComponent(q)}?translation=${translation}`,
  ];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    for (const u of urls) {
      try {
        const r = await fetch(u, { signal: ctrl.signal });
        if (!r.ok) continue;
        const d = await r.json();
        const text = d.text || d.verses?.[0]?.text || d.verse?.text || d.data?.text;
        if (text) {
          const clean = String(text).replace(/\s+/g, ' ').trim();
          if (store) {
            const v = await loadVersion(store, translation);
            if (v?.file) {
              const ds = v.dataset;
              (ds.books[book.name] ||= {});
              (ds.books[book.name][String(ref.chapter)] ||= {})[String(ref.verse)] = clean;
              await store.save('bibles', v.file, ds);
              memCache.delete(translation);
            }
          }
          return { text: clean, online: true };
        }
      } catch { }
    }
  } finally { clearTimeout(timer); }
  return { text: null, online: false };
}
