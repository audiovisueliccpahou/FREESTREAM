#!/usr/bin/env node
/**
 * FREESTREAM — convertisseur hors ligne (aucune dépendance npm).
 *
 *   node outils/convertir.mjs bible <fichier> [--version "Nom de version"]
 *       Formats lus : .json (FREESTREAM, array ou objet), .csv/.tsv, .txt,
 *                     .xml (OSIS, Zefania, USFX), .json API bible.
 *       Sortie : donnees/bibles/<nom>.json au format FREESTREAM.
 *
 *   node outils/convertir.mjs chants <fichier>
 *       Formats lus : .json (FREESTREAM), .txt/.chordpro (séparateur double
 *                     retour à la ligne), .csv.
 *       Sortie : donnees/chants/<nom>.json
 *
 *   node outils/convertir.mjs diapos <fichier.pptx|docx|odp|pdf> [--dpi 150]
 *       Convertit en PDF via LibreOffice (si présent), puis en images PNG via
 *       pdftoppm (si présent). Les fichiers produits vont dans donnees/medias/.
 *       Sans LibreOffice, le fichier est simplement copié et un message clair
 *       explique la marche à suivre.
 *
 *   node outils/convertir.mjs analyser <fichier>     → diagnostic du format
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'donnees');
const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const dim = s => `\x1b[90m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;

const say = (...a) => console.log(...a);
const die = m => { console.error(red('ERREUR : ' + m)); process.exit(1); };
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'import';
const read = f => fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');

/* -------------------------------------------------------------- livres */
const BOOKS = [
  ['Genèse','gen','genese,genesis,gen,1mo,mose'], ['Exode','ex','exode,exodus,ex,2mo'],
  ['Lévitique','lev','levitique,leviticus,lev,3mo'], ['Nombres','nom','nombres,numbers,num,nom,4mo'],
  ['Deutéronome','deut','deuteronome,deuteronomy,deut,dt,5mo'], ['Josué','jos','josue,joshua,jos'],
  ['Juges','jug','juges,judges,jug,jg'], ['Ruth','ruth','ruth,rut'],
  ['1 Samuel','1sa','1samuel,1sam,1sa,1s'], ['2 Samuel','2sa','2samuel,2sam,2sa,2s'],
  ['1 Rois','1ro','1rois,1kings,1ro,1ki'], ['2 Rois','2ro','2rois,2kings,2ro,2ki'],
  ['1 Chroniques','1ch','1chroniques,1chronicles,1ch,1chr'], ['2 Chroniques','2ch','2chroniques,2chronicles,2ch,2chr'],
  ['Esdras','esd','esdras,ezra,esd'], ['Néhémie','neh','nehemie,nehemiah,neh,ne'],
  ['Esther','est','esther,est'], ['Job','job','job,jb'], ['Psaumes','ps','psaumes,psalms,psa,ps'],
  ['Proverbes','pr','proverbes,proverbs,prov,pr'], ['Ecclésiaste','ecc','ecclesiaste,ecclesiastes,ecc,ec'],
  ['Cantique','cant','cantique,canticles,song,ca'], ['Ésaïe','esa','esaie,esaias,isaiah,isa,es'],
  ['Jérémie','jer','jeremie,jeremiah,jer'], ['Lamentations','lam','lamentations,lamentations,lam'],
  ['Ézéchiel','eze','ezechiel,ezekiel,eze,ezek'], ['Daniel','dan','daniel,dan,da'],
  ['Osée','ose','osee,hosea,hos,ose'], ['Joël','joe','joel,joe,jl'], ['Amos','amos','amos,am'],
  ['Abdias','abd','abdias,obadiah,obad,abd'], ['Jonas','jon','jonas,jonah,jon'],
  ['Michée','mic','michee,micah,mic'], ['Nahum','nah','nahum,nah'],
  ['Habakuk','hab','habakuk,habakkuk,hab'], ['Sophonie','sop','sophonie,zephaniah,zeph,sop'],
  ['Aggée','agg','aggee,haggai,hag,agg'], ['Zacharie','zac','zacharie,zechariah,zech,zac'],
  ['Malachie','mal','malachie,malachi,mal'],
  ['Matthieu','mat','matthieu,matthew,matt,mat,mt'], ['Marc','marc','marc,mark,mar,mc,mk'],
  ['Luc','luc','luc,luke,luc,lk'], ['Jean','jean','jean,john,jn,j'],
  ['Actes','act','actes,acts,act,ac'], ['Romains','rom','romains,romans,rom,ro'],
  ['1 Corinthiens','1co','1corinthiens,1corinthians,1cor,1co'],
  ['2 Corinthiens','2co','2corinthiens,2corinthians,2cor,2co'],
  ['Galates','gal','galates,galatians,gal'], ['Éphésiens','eph','ephesiens,ephesians,eph,ep'],
  ['Philippiens','phi','philippiens,philippians,phil,phi'], ['Colossiens','col','colossiens,colossians,col'],
  ['1 Thessaloniciens','1th','1thessaloniciens,1thessalonians,1thess,1th'],
  ['2 Thessaloniciens','2th','2thessaloniciens,2thessalonians,2thess,2th'],
  ['1 Timothée','1ti','1timothee,1timothy,1tim,1ti'], ['2 Timothée','2ti','2timothee,2timothy,2tim,2ti'],
  ['Tite','tite','tite,titus,tit'], ['Philémon','phm','philemon,philem,phm'],
  ['Hébreux','heb','hebreux,hebrews,heb'], ['Jacques','jac','jacques,james,jac,jas'],
  ['1 Pierre','1pi','1pierre,1peter,1pet,1pi'], ['2 Pierre','2pi','2pierre,2peter,2pet,2pi'],
  ['1 Jean','1jn','1jean,1john,1jn,1j'], ['2 Jean','2jn','2jean,2john,2jn,2j'],
  ['3 Jean','3jn','3jean,3john,3jn,3j'], ['Jude','jude','jude,jud'],
  ['Apocalypse','apoc','apocalypse,revelation,rev,apoc,ap'],
];
const norm = s => slug(String(s || ''));
function canonBook(raw) {
  const k = norm(raw).replace(/[^a-z0-9]/g, '');
  if (!k) return null;
  for (const [name, abbr, keys] of BOOKS) {
    for (const a of (keys || '').split(',')) if (norm(a).replace(/[^a-z0-9]/g, '') === k) return name;
  }
  for (const [name, abbr] of BOOKS) {
    const n = norm(name).replace(/[^a-z0-9]/g, '');
    if (k.startsWith(n) || n.startsWith(k)) return name;
  }
  return null;
}

/* -------------------------------------------------------------- parsing */
let warnings = 0;
function emptyBible() { return { version: '', books: {} }; }
function put(bible, book, chap, verse, text) {
  const b = canonBook(book);
  const c = parseInt(chap, 10), v = parseInt(verse, 10);
  const t = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!b || !Number.isFinite(c) || !Number.isFinite(v) || c < 1 || v < 1 || !t) { warnings++; return; }
  bible.books[b] ||= {};
  bible.books[b][c] ||= {};
  bible.books[b][c][v] = t;
}

function parseCSV(raw, sep) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const split = l => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  return lines.map(split);
}

function fromRows(rows) {
  const bible = emptyBible();
  if (!rows.length) return bible;
  const h = rows[0].map(x => norm(x).replace(/[^a-z]/g, ''));
  const idx = (...names) => {
    for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
  let ib = idx('livre', 'book', 'bookname'), ic = idx('chapitre', 'chapter', 'ch'),
      iv = idx('verset', 'verse', 'v'), it = idx('texte', 'text', 'content', 'mot');
  const simple = ib < 0 || ic < 0 || iv < 0 || it < 0;
  const start = simple ? 0 : 1;
  if (simple) {
    // formes compactes : "Genèse 1:1", tab, texte
    ib = 0; ic = -1; iv = -1; it = rows[0].length > 2 ? 2 : 1;
  }
  for (let r = start; r < rows.length; r++) {
    const row = rows[r]; if (!row.length) continue;
    if (simple) {
      const m = String(row[0] || '').match(/^\s*(.+?)[\s.:]+(\d+)[\s:.,]+(\d+)\s*$/);
      if (m) put(bible, m[1], m[2], m[3], row[it] ?? row[1]);
      else if (row.length >= 4) put(bible, row[0], row[1], row[2], row[3]);
      continue;
    }
    put(bible, row[ib], row[ic], row[iv], row[it]);
  }
  return bible;
}

function fromJSON(raw) {
  const d = JSON.parse(raw);
  const bible = emptyBible();
  const arr = Array.isArray(d) ? d : (Array.isArray(d.verses) ? d.verses : Array.isArray(d.records) ? d.records : null);
  if (d.books && typeof d.books === 'object' && !Array.isArray(d.books)) {
    for (const [book, chaps] of Object.entries(d.books)) {
      if (Array.isArray(chaps)) chaps.forEach((verses, i) => {
        if (Array.isArray(verses)) verses.forEach((t, j) => put(bible, book, i + 1, j + 1, t));
        else if (verses && typeof verses === 'object') Object.entries(verses).forEach(([v, t]) => put(bible, book, i + 1, v, t));
      });
      else if (chaps && typeof chaps === 'object') Object.entries(chaps).forEach(([c, verses]) => {
        if (Array.isArray(verses)) verses.forEach((t, i) => put(bible, book, c, i + 1, t));
        else if (verses && typeof verses === 'object') Object.entries(verses).forEach(([v, t]) => put(bible, book, c, v, t));
      });
    }
    if (d.version || d.name) bible.version = d.version || d.name;
    return bible;
  }
  if (arr) {
    for (const r of arr) {
      put(bible, r.book ?? r.livre ?? r.bookName ?? r.b, r.chapter ?? r.chapitre ?? r.c,
        r.verse ?? r.verset ?? r.v, r.text ?? r.texte ?? r.content ?? r.t ?? r.plaintext);
    }
    if (d.version || d.name) bible.version = d.version || d.name;
    return bible;
  }
  die('JSON non reconnu. Formats acceptés : {books:{Livre:{1:{1:"texte"}}}} ou [{book,chapter,verse,text}].');
}

function fromXML(raw) {
  const bible = emptyBible();
  const isOsis = /<osis/i.test(raw), isZef = /<XMLBIBLE/i.test(raw), isUsfx = /<usfx/i.test(raw);
  const tag = t => new RegExp('<' + t + '\\b[^>]*>([\\s\\S]*?)</' + t + '>', 'gi');
  const attr = (s, n) => (s.match(new RegExp(n + '\\s*=\\s*["\']([^"\']+)["\']', 'i')) || [])[1];
  const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

  if (isZef) {
    for (const bm of raw.matchAll(/<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi)) {
      const book = attr(bm[1], 'bname') || attr(bm[1], 'bsname');
      for (const cm of bm[2].matchAll(/<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi)) {
        const c = attr(cm[1], 'cnumber');
        for (const vm of cm[2].matchAll(/<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi)) put(bible, book, c, attr(vm[1], 'vnumber'), strip(vm[2]));
      }
    }
  } else if (isUsfx) {
    let book = '', c = '';
    for (const m of raw.matchAll(/<(bk| chapter|vc|v|p)\b([^>]*)>([\s\S]*?)(?=<(?:bk|chapter|vc|v|p)\b|$)/gi)) {
      const t = m[1].toLowerCase().trim();
      if (t === 'bk') book = strip(m[3]);
      else if (t === 'chapter') c = attr(m[2], 'cnumber') || m[3];
      else if (t === 'vc' || t === 'v') { const v = attr(m[2], 'vnumber'); if (v) put(bible, book, c, v, strip(m[3])); }
    }
  } else { // OSIS ou XML générique avec attributs book/chapter/verse
    let book = '', c = '';
    for (const m of raw.matchAll(/<((?:div|chapter|verse|milestone))\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi)) {
      const t = m[1].toLowerCase(), at = m[2] || '', inner = m[3] || '';
      const bid = attr(at, 'osisID') || '';
      if (t === 'div' && bid.startsWith('bible.')) { book = bid.split('.')[1] || book; continue; }
      if (t === 'chapter' && bid) { const parts = bid.split('.'); book = parts[0]; c = parts[1]; continue; }
      if (t === 'verse' || (t === 'milestone' && attr(at, 'type') === 'x-verse')) {
        const vid = bid || attr(at, 'osisID') || '';
        const parts = vid.split('.');
        const bk = parts.length > 1 ? parts[0] : book;
        const ch = parts.length > 1 ? parts[1] : c;
        const vs = parts[parts.length - 1];
        put(bible, bk, ch, vs, strip(inner));
      }
    }
    // repli : <verse osisID="Gen.1.1">texte</verse> sans bloc chapter
    if (!Object.keys(bible.books).length) {
      for (const m of raw.matchAll(/<verse\b([^>]*)>([\s\S]*?)<\/verse>/gi)) {
        const parts = (attr(m[1], 'osisID') || '').split('.');
        if (parts.length >= 3) put(bible, parts[0], parts[1], parts[2], strip(m[2]));
      }
    }
  }
  return bible;
}

function fromTXT(raw) {
  const bible = emptyBible();
  const re = /^\s*([1-3]?\s*[A-Za-zÀ-ÿ.'’\- ]+?)\s+(\d{1,3})[:.,]\s*(\d{1,3})\s+(.+)$/;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(re); if (m) put(bible, m[1], m[2], m[3], m[4]);
  }
  return bible;
}

function convertBible(file, version) {
  const raw = read(file), ext = path.extname(file).toLowerCase();
  let bible;
  if (ext === '.json') bible = fromJSON(raw);
  else if (ext === '.csv') bible = fromRows(parseCSV(raw, ','));
  else if (ext === '.tsv' || ext === '.txt' && /;|\t/.test(raw.split(/\r?\n/)[0])) bible = fromRows(parseCSV(raw, /\t/.test(raw.split(/\r?\n/)[0]) ? '\t' : ';'));
  else if (ext === '.xml' || ext === '.osis' || ext === '.usfx') bible = fromXML(raw);
  else bible = fromTXT(raw);
  const books = Object.keys(bible.books);
  if (!books.length) die('Aucun verset exploitable trouvé dans ' + file + '. Essayez : node outils/convertir.mjs analyser ' + file);
  bible.version = version || bible.version || path.basename(file, ext).replace(/[-_]/g, ' ');
  bible.language = 'fr';
  bible.abbreviation = slug(bible.version).slice(0, 12).toUpperCase();
  bible.importedAt = new Date().toISOString();
  let verses = 0; for (const b of Object.values(bible.books)) for (const c of Object.values(b)) verses += Object.keys(c).length;
  fs.mkdirSync(path.join(OUT, 'bibles'), { recursive: true });
  const out = path.join(OUT, 'bibles', slug(bible.version) + '.json');
  fs.writeFileSync(out, JSON.stringify(bible, null, 1), 'utf8');
  say(green('✓ Bible importée'));
  say('  Version    : ' + bible.version);
  say('  Livres     : ' + books.length);
  say('  Versets    : ' + verses);
  if (warnings) say(yellow('  Lignes ignorées (référence ou livre non reconnu) : ' + warnings));
  say('  Fichier    : ' + path.relative(ROOT, out));
  say(dim('  Redémarrez la régie puis choisissez cette version dans Bible → Versions & import.'));
}

function convertChants(file) {
  const raw = read(file), ext = path.extname(file).toLowerCase();
  fs.mkdirSync(path.join(OUT, 'chants'), { recursive: true });
  const writeOne = (title, content) => {
    const name = slug(title) + '.json';
    // Même sémantique que l'éditeur : 1 retour = nouvelle ligne, 2 retours = nouvelle section.
    const sections = String(content).split(/\r?\n\s*\r?\n/).map((block, i) => ({
      id: 'sec-' + slug(title) + '-' + i, label: '',
      lines: block.split(/\r?\n/).map(l => l.trim()).filter(Boolean), chords: [],
    })).filter(s => s.lines.length);
    const stamp = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'chants', name), JSON.stringify({
      id: 'song-' + slug(title), title, sections, tags: [], author: '', key: '',
      meta: { source: path.basename(file) }, createdAt: stamp, updatedAt: stamp,
    }, null, 2), 'utf8');
    return name;
  };
  let made = [];
  if (ext === '.json') {
    const d = JSON.parse(raw);
    const list = Array.isArray(d) ? d : [d];
    for (const s of list) {
      const title = s.title || s.titre || s.name || path.basename(file, ext);
      const content = typeof s.content === 'string' ? s.content
        : Array.isArray(s.content) ? s.content.map(x => typeof x === 'string' ? x : (x.lines || []).join('\n')).join('\n\n')
        : JSON.stringify(s.content ?? s);
      made.push(writeOne(title, content));
    }
  } else if (ext === '.csv') {
    for (const row of parseCSV(raw, ',').slice(1)) if (row[0]) made.push(writeOne(row[0], (row[1] || '').replace(/\\n/g, '\n')));
  } else {
    // Un ou plusieurs chants séparés par une ligne "# TITRE" ou un triple saut de ligne.
    const chunks = raw.split(/\r?\n(?=#\s)/).filter(x => x.trim());
    for (const ch of chunks) {
      const lines = ch.split(/\r?\n/);
      const first = lines[0].replace(/^#\s*/, '').trim();
      const title = first || path.basename(file, ext).replace(/[-_]/g, ' ');
      const body = (first && !/^#/.test(lines[0]) ? lines.slice(1) : lines.slice(1)).join('\n').trim();
      made.push(writeOne(title, body));
    }
  }
  if (!made.length) die('Aucun chant trouvé dans ' + file);
  say(green('✓ ' + made.length + ' chant(s) importé(s) dans donnees/chants/'));
  for (const m of made.slice(0, 12)) say('  · ' + m);
  if (made.length > 12) say(dim('  … et ' + (made.length - 12) + ' autres'));
  say(dim('  Les chants sortent toujours en GRANDS CARACTÈRES, même saisis en minuscules.'));
}

function findSoffice() {
  const cands = process.platform === 'win32'
    ? ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe', 'soffice']
    : ['soffice', 'libreoffice', '/usr/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  for (const c of cands) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8', timeout: 10000 });
    if (r.status === 0) return c;
  }
  return null;
}
function which(c) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8', timeout: 8000 });
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

function convertSlides(file, dpi) {
  if (!fs.existsSync(file)) die('Fichier introuvable : ' + file);
  fs.mkdirSync(path.join(OUT, 'medias'), { recursive: true });
  const ext = path.extname(file).toLowerCase();
  const base = slug(path.basename(file, ext));
  const so = findSoffice();
  if (!['.pdf'].includes(ext) && !so) {
    const dest = path.join(OUT, 'medias', path.basename(file));
    fs.copyFileSync(file, dest);
    say(yellow('LibreOffice est absent : le fichier a simplement été copié dans donnees/medias/.'));
    say('  Pour contrôler les diapositives page par page dans FREESTREAM, installez LibreOffice');
    say('  (gratuit, hors ligne) puis relancez cette commande — ou exportez en PDF/PNG.');
    say('  Copié : ' + path.relative(ROOT, dest));
    return;
  }
  let pdf = file;
  if (ext !== '.pdf') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-conv-'));
    say(dim('  Conversion en PDF via LibreOffice…'));
    const r = spawnSync(so, ['--headless', '--nologo', '--nodefault', '--nofirststartwizard',
      '--convert-to', 'pdf', '--outdir', tmp, file], { encoding: 'utf8', timeout: 180000 });
    pdf = path.join(tmp, path.basename(file, ext) + '.pdf');
    if (!fs.existsSync(pdf)) die('Conversion échouée : ' + (r.stderr || r.stdout || 'raison inconnue'));
    const dest = path.join(OUT, 'medias', base + '.pdf');
    fs.copyFileSync(pdf, dest);
    say(green('✓ PDF créé : ' + path.relative(ROOT, dest)));
    pdf = dest;
  } else if (path.resolve(file) !== path.resolve(path.join(OUT, 'medias', path.basename(file)))) {
    fs.copyFileSync(file, path.join(OUT, 'medias', path.basename(file)));
  }
  const ppm = which('pdftoppm');
  if (!ppm) {
    say(yellow('  pdftoppm absent : les images PNG ne sont pas générées.'));
    say('  Le PDF suffit : dans Médias, utilisez les boutons ‹ › pour changer de page (page=1, page=2…).');
    say('  Installez poppler-utils pour obtenir aussi une image par diapositive.');
    return;
  }
  say(dim('  Rendu des pages en PNG (' + dpi + ' dpi)…'));
  const prefix = path.join(OUT, 'medias', base + '-page');
  const r = spawnSync(ppm, ['-png', '-r', String(dpi), pdf, prefix], { encoding: 'utf8', timeout: 600000 });
  const pngs = fs.readdirSync(path.join(OUT, 'medias')).filter(n => n.startsWith(base + '-page') && n.endsWith('.png')).sort();
  if (!pngs.length) { say(yellow('  Aucun PNG produit : ' + (r.stderr || '').slice(0, 200))); return; }
  say(green('✓ ' + pngs.length + ' diapositive(s) exportée(s) en PNG dans donnees/medias/'));
  say('  ' + pngs.slice(0, 4).join(', ') + (pngs.length > 4 ? ' …' : ''));
  say(dim('  Ajoutez-les dans Médias → Importer un fichier, puis cliquez une fois (aperçu) et une seconde fois (OBS).'));
}

function analyser(file) {
  const raw = read(file);
  const lines = raw.split(/\r?\n/);
  say('Fichier      : ' + file);
  say('Taille       : ' + (fs.statSync(file).size / 1024).toFixed(1) + ' Ko');
  say('Lignes       : ' + lines.length);
  say('Encodage     : ' + (/\uFFFD/.test(raw) ? 'contient des caractères mal décodés' : 'UTF-8 plausible'));
  say('En-tête      : ' + JSON.stringify(lines.slice(0, 3).map(l => l.slice(0, 120))));
  say('Séparateur   : ' + (/\t/.test(lines[0] || '') ? 'tabulation' : /;/.test(lines[0] || '') ? 'point-virgule' : /,/.test(lines[0] || '') ? 'virgule' : 'aucun'));
  say('XML          : ' + (/<osis|<XMLBIBLE|<usfx|<verse/i.test(raw) ? 'oui' : 'non'));
  say('Références   : ' + (lines.slice(0, 50).filter(l => /\d{1,3}[:.]\d{1,3}/.test(l)).length) + ' sur les 50 premières lignes');
}

/* ------------------------------------------------------------------ main */
const argv = process.argv.slice(2);
const cmd = (argv[0] || '').toLowerCase();
if (!cmd || cmd === 'aide' || cmd === '--help' || cmd === '-h') {
  say(`FREESTREAM — convertisseur hors ligne

  node outils/convertir.mjs bible <fichier> [--version "Nom"]
  node outils/convertir.mjs chants <fichier>
  node outils/convertir.mjs diapos <fichier.pptx|docx|odp|pdf> [--dpi 150]
  node outils/convertir.mjs analyser <fichier>

Aucune dépendance, aucun réseau. Les résultats vont dans donnees/.`);
  process.exit(0);
}
const file = argv[1];
if (!file) die('Indiquez un fichier. Exemple : node outils/convertir.mjs bible ma-bible.csv');
if (!fs.existsSync(file)) die('Fichier introuvable : ' + file);
const vi = argv.indexOf('--version');
const version = vi >= 0 ? argv[vi + 1] : undefined;
const di = argv.indexOf('--dpi');
const dpi = di >= 0 ? parseInt(argv[di + 1], 10) : 150;
try {
  if (cmd === 'bible') convertBible(file, version);
  else if (cmd === 'chants' || cmd === 'chants') convertChants(file);
  else if (cmd === 'diapos' || cmd === 'slides') convertSlides(file, dpi);
  else if (cmd === 'analyser') analyser(file);
  else die('Commande inconnue : ' + cmd);
} catch (e) { die(e.message); }
