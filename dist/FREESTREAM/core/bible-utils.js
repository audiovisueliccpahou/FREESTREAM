// FREESTREAM — logique biblique pure, testable sans navigateur.

export const BOOKS = Object.freeze([
  // id, nom, abréviations / alias, nombre de chapitres
  ['gen','Genèse',['genese','genesis','gn','ge','gen'],50],
  ['exo','Exode',['exode','ex','exod'],40],
  ['lev','Lévitique',['levitique','lev','lv'],27],
  ['nom','Nombres',['nombres','nom','nb','num'],36],
  ['deu','Deutéronome',['deuteronome','deut','dt','de'],34],
  ['jos','Josué',['josue','jos','josh'],24],
  ['jug','Juges',['juges','jug','jdg','jg'],21],
  ['rut','Ruth',['ruth','rut','rt'],4],
  ['1sa','1 Samuel',['1samuel','1 sam','1sa','1s','1sm'],31],
  ['2sa','2 Samuel',['2samuel','2 sam','2sa','2s','2sm'],24],
  ['1ro','1 Rois',['1rois','1 rois','1roi','1r','1ki'],22],
  ['2ro','2 Rois',['2rois','2 rois','2roi','2r','2ki'],25],
  ['1ch','1 Chroniques',['1chroniques','1 ch','1chr','1ch','1par'],29],
  ['2ch','2 Chroniques',['2chroniques','2 ch','2chr','2ch','2par'],36],
  ['esd','Esdras',['esdras','esd','ezr'],10],
  ['neh','Néhémie',['nehemie','neh','ne','nehemie'],13],
  ['est','Esther',['esther','est','es','esth'],10],
  ['job','Job',['job','jb'],42],
  ['psa','Psaumes',['psaumes','psaume','psa','ps','psalm','pss'],150],
  ['pro','Proverbes',['proverbes','proverbe','pro','pr','prov'],31],
  ['ecc','Ecclésiaste',['ecclesiaste','ecc','ec','eccl'],12],
  ['can','Cantique des Cantiques',['cantique','cantiquedescantiques','can','cc','song'],8],
  ['esa','Ésaïe',['esaie','esai','isa','isaie','ésaïe'],66],
  ['jer','Jérémie',['jeremie','jeremie','jer','je','jeremiah'],52],
  ['lam','Lamentations',['lamentations','lam','la'],5],
  ['eze','Ézéchiel',['ezechiel','eze','ez','ezekiel'],48],
  ['dan','Daniel',['daniel','dan','da','dn'],12],
  ['ose','Osée',['osee','ose','os','hos'],14],
  ['joe','Joël',['joel','joe','jl'],3],
  ['amo','Amos',['amos','amo','am'],9],
  ['abd','Abdias',['abdias','abd','ob'],1],
  ['jon','Jonas',['jonas','jon','jn2'],4],
  ['mic','Michée',['michee','mic','mi'],7],
  ['nah','Nahum',['nahum','nah','na'],3],
  ['hab','Habakuk',['habakuk','habacuc','hab','hb'],3],
  ['sop','Sophonie',['sophonie','sop','so','zeph'],3],
  ['agg','Aggée',['aggee','agg','ag','hag'],2],
  ['zac','Zacharie',['zacharie','zac','za','zech'],14],
  ['mal','Malachie',['malachie','mal','ma','ml'],4],
  ['mat','Matthieu',['matthieu','mat','mt','matt'],28],
  ['mar','Marc',['marc','mar','mc','mr'],16],
  ['luc','Luc',['luc','lu','lk'],24],
  ['jea','Jean',['jean','jea','jn','j','john'],21],
  ['act','Actes',['actes','act','ac','acts'],28],
  ['rom','Romains',['romains','rom','ro','rm'],16],
  ['1co','1 Corinthiens',['1corinthiens','1 cor','1co','1c','1cor'],16],
  ['2co','2 Corinthiens',['2corinthiens','2 cor','2co','2c','2cor'],13],
  ['gal','Galates',['galates','gal','ga'],6],
  ['eph','Éphésiens',['ephesiens','eph','ep','ephes'],6],
  ['phi','Philippiens',['philippiens','phi','ph','phil'],4],
  ['col','Colossiens',['colossiens','col','cl'],4],
  ['1th','1 Thessaloniciens',['1thessaloniciens','1 th','1th','1thess'],5],
  ['2th','2 Thessaloniciens',['2thessaloniciens','2 th','2th','2thess'],3],
  ['1ti','1 Timothée',['1timothee','1 ti','1ti','1tim'],6],
  ['2ti','2 Timothée',['2timothee','2 ti','2ti','2tim'],4],
  ['tit','Tite',['tite','tit','ti'],3],
  ['phm','Philémon',['philemon','phm','pm'],1],
  ['heb','Hébreux',['hebreux','heb','he','hebrews'],13],
  ['jac','Jacques',['jacques','jac','ja','jas'],5],
  ['1pi','1 Pierre',['1pierre','1 pi','1pi','1p','1pet'],5],
  ['2pi','2 Pierre',['2pierre','2 pi','2pi','2p','2pet'],3],
  ['1jn','1 Jean',['1jean','1 jn','1jn','1j','1john'],5],
  ['2jn','2 Jean',['2jean','2 jn','2jn','2j','2john'],1],
  ['3jn','3 Jean',['3jean','3 jn','3jn','3j','3john'],1],
  ['jud','Jude',['jude','jud','jd'],1],
  ['apo','Apocalypse',['apocalypse','apo','ap','rev'],22],
].map(([id, name, aliases, chapters]) => Object.freeze({ id, name, aliases, chapters })));

const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const BOOK_NORM = new Map();
for (const b of BOOKS) { BOOK_NORM.set(norm(b.name), b); for (const a of b.aliases) BOOK_NORM.set(norm(a), b); }

export function getBook(name) {
  if (!name) return null;
  const n = norm(name);
  return BOOK_NORM.get(n) || BOOKS.find(b => norm(b.name) === n) || null;
}

function lev(a, b) {
  a = norm(a); b = norm(b);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Recherche de livre « intelligente » : 1 ou 2 lettres suffisent.
 * Classe par proximité (préfixe exact > préfixe d'alias > sous-séquence > distance).
 */
export function searchBooks(query, limit = 12) {
  const q = norm(query);
  if (!q) return BOOKS.slice(0, limit);
  const scored = [];
  for (const b of BOOKS) {
    const names = [b.name, ...b.aliases].map(norm);
    let best = 999, matched = '';
    for (const n of names) {
      let s;
      if (n === q) s = 0;
      else if (n.startsWith(q)) s = 1 + (n.length - q.length) * 0.02;
      else if (q.startsWith(n) && n.length >= 2) s = 2;
      else if (n.includes(q)) s = 3 + (n.indexOf(q)) * 0.02;
      else if (isSubsequence(q, n)) s = 5 + (n.length - q.length) * 0.02;
      else s = 10 + lev(q, n);
      if (s < best) { best = s; matched = n; }
    }
    scored.push({ ...b, score: best, matched });
  }
  scored.sort((a, b) => a.score - b.score || BOOKS.indexOf(BOOKS.find(x=>x.id===a.id)) - BOOKS.indexOf(BOOKS.find(x=>x.id===b.id)));
  return scored.filter(s => s.score < 12).slice(0, limit);
}
function isSubsequence(q, s) { let i = 0; for (const c of s) if (c === q[i]) i++; return i === q.length; }

/**
 * Analyse une référence tapée au clavier.
 * Accepte : "es 8 9", "Esther 8:9", "jn3 16", "1co 13 4", "ps 23:1-6", "jean 3".
 * Le séparateur ESPACE entre chapitre et verset est volontairement géré.
 */
export function parseReference(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  // 1) le premier bloc alphabétique est le livre (avec éventuel chiffre préfixe)
  const m = /^(\d?\s*[a-zA-ZÀ-ÿ'’\-]+)\s*(.*)$/.exec(raw);
  if (!m) {
    const nums = raw.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/);
    if (nums) return { book: null, bookName: null, chapter: +nums[2], verse: +nums[3], raw };
    return null;
  }
  const bookPart = m[1].trim();
  const book = getBook(bookPart) || searchBooks(bookPart, 1)[0] || null;
  const rest = (m[2] || '').trim();
  const nums = rest.match(/^(\d+)\s*(?::|\.|\s|,|v\.?|verset\s*)?\s*(\d+)?\s*(?:[-–]\s*(\d+))?/i);
  if (!nums) return { book, bookName: book?.name || null, chapter: 1, verse: 1, raw };
  const chapter = Math.max(1, parseInt(nums[1], 10) || 1);
  const verse = Math.max(1, parseInt(nums[2], 10) || 1);
  const toVerse = nums[3] ? Math.max(verse, parseInt(nums[3], 10)) : null;
  return { book, bookName: book?.name || null, chapter, verse, toVerse, raw };
}

export function formatRef(book, chapter, verse, toVerse = null) {
  const n = typeof book === 'string' ? book : book?.name || '';
  return `${n} ${chapter}:${verse}${toVerse && toVerse !== verse ? `-${toVerse}` : ''}`;
}

export function chapterList(book) {
  const b = typeof book === 'string' ? getBook(book) : book;
  return b ? Array.from({ length: b.chapters }, (_, i) => i + 1) : [];
}

/** Navigation verset suivant / précédent, avec repli sur le chapitre voisin. */
export function stepVerse(ref, delta, verseCount = c => 30) {
  const b = typeof ref.book === 'string' ? getBook(ref.book) : ref.book;
  if (!b) return ref;
  let { chapter, verse } = ref;
  verse += delta;
  const max = verseCount(chapter) || 30;
  if (verse > max) { chapter++; verse = 1; }
  if (verse < 1) {
    chapter--;
    if (chapter < 1) { chapter = 1; verse = 1; }
    else verse = verseCount(chapter) || 30;
  }
  chapter = Math.max(1, Math.min(b.chapters, chapter));
  return { ...ref, book: b.name, chapter, verse, toVerse: null };
}

/** Recherche par mots-clés + « paraphrase » (score de pertinence, tolérant). */
export function searchVerses(dataset, query, limit = 40) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(/\s+/).filter(w => w.length > 1);
  const out = [];
  for (const [bookName, chapters] of Object.entries(dataset?.books || {})) {
    for (const [ch, verses] of Object.entries(chapters)) {
      for (const [v, text] of Object.entries(verses)) {
        const t = norm(text);
        let score = 0;
        if (t.includes(q)) score += 10;
        for (const w of words) {
          if (t.includes(w)) score += 3;
          else if (t.includes(w.slice(0, Math.max(3, w.length - 2)))) score += 1;
        }
        // « paraphrase » : chevauchement de vocabulaire
        const tw = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
        const overlap = words.filter(w => [...tw].some(x => lev(x, w) <= 2)).length;
        score += overlap * 1.5;
        if (score > 0) out.push({ book: bookName, chapter: +ch, verse: +v, text, score });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function verseCountFromDataset(dataset, bookName, chapter) {
  const ch = dataset?.books?.[bookName]?.[String(chapter)];
  if (!ch) return 30;
  const nums = Object.keys(ch).map(Number).filter(n => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : 30;
}
