#!/usr/bin/env node
/**
 * FREESTREAM — fabrication du dossier livrable.
 *
 *   node outils/exporter.mjs                    → ./dist/FREESTREAM
 *   node outils/exporter.mjs --dest C:\FREESTREAM
 *   node outils/exporter.mjs --zip             → crée aussi une archive .zip
 *   node outils/exporter.mjs --include-tests   → inclut les tests (développement)
 *
 * Le dossier obtenu est autonome : copiez-le à la racine de C:\ puis double-cliquez
 * sur DEMARRER.bat. Aucune installation n'est obligatoire (mode dossier possible),
 * Node.js ou Python apportent simplement la synchronisation instantanée.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const has = name => argv.includes(name);
const green = s => `\x1b[32m${s}\x1b[0m`;
const dim = s => `\x1b[90m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;

const DEST = path.resolve(arg('--dest', path.join(ROOT, 'dist', 'FREESTREAM')));
if (path.resolve(DEST) === ROOT || DEST.startsWith(ROOT + path.sep) && DEST === ROOT) {
  console.error(red('Refus : la destination ne peut pas être le dossier source.')); process.exit(1);
}

const INCLUDE = [
  'index.html', 'regie.html', 'regies/', 'outputs/', 'core/', 'regie/', 'styles/',
  'templates/', 'outils/', 'donnees/', 'docs/', 'server.js', 'server.py',
  'DEMARRER.bat', 'DIAGNOSTIC.bat', 'CONSTRUIRE-EXE.bat', 'DEMARRER.sh', 'DEMARRER.command', 'server.ps1',
  'README.md', 'LISEZ-MOI.txt', 'VERSION.txt',
  'ROADMAP.md', 'package.json', '.gitignore',
];
const EXCLUDE_DIR = new Set(['node_modules', '.git', '.cache', '.venv', 'dist', '__pycache__',
  '.pytest_cache', '.ruff_cache', 'coverage', '.next', '.arena', 'Unselected files']);
const EXCLUDE_FILE = /\.(log|tmp|pyc|map|exe|blob)$|^screenshot-|^state\.json$|^live\.js$|^DIAGNOSTIC\.txt$|^DEMARRAGE-LOG\.txt$|^\.DS_Store$|^\._/i;
const DATA_FOLDERS = ['bibles', 'chants', 'lowerthirds', 'medias', 'projets', 'designs', 'polices', 'etat'];

let files = 0, bytes = 0, skipped = 0;
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // WINDOWS : deux pieges mortels corriges ici, systematiquement.
  //  1) .bat -> CRLF obligatoire (sinon labels/goto cassent). ASCII pur.
  //  2) .ps1 -> BOM UTF-8 OBLIGATOIRE. Sans BOM, Windows PowerShell 5.1 lit
  //     le fichier en ANSI/Windows-1252 : les caracteres non-ASCII deviennent
  //     alors des guillemets typographiques que PowerShell prend pour de vrais
  //     delimiteurs de chaine -> erreur de parsing -> fenetre noire qui se ferme.
  if (dest.toLowerCase().endsWith('.bat')) {
    const txt = fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '').replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(dest, txt, 'utf8');
  } else if (dest.toLowerCase().endsWith('.ps1')) {
    const txt = fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '').replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(dest, '\uFEFF' + txt, 'utf8');
  } else fs.copyFileSync(src, dest);
  files++; bytes += fs.statSync(dest).size;
}
function walk(src, dest) {
  if (!fs.existsSync(src)) return;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (EXCLUDE_DIR.has(ent.name)) { skipped++; continue; }
      walk(path.join(src, ent.name), path.join(dest, ent.name));
    } else {
      if (EXCLUDE_FILE.test(ent.name)) { skipped++; continue; }
      copyFile(path.join(src, ent.name), path.join(dest, ent.name));
    }
  }
}
function ensure(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, '.gitkeep'), '');
  }
}

console.log('\n  FREESTREAM — fabrication du dossier livrable');
console.log('  Source      : ' + ROOT);
console.log('  Destination : ' + DEST + '\n');

// Un eventuel .exe deja present dans le livrable est conserve d'un export a
// l'autre : c'est un binaire de 83 Mo qu'on ne veut pas avoir a reconstruire.
let carriedExe = null;
if (fs.existsSync(DEST)) {
  if (!has('--force')) {
    console.error(red('Le dossier existe déjà. Utilisez --force pour le remplacer, ou --dest autre-part.'));
    process.exit(1);
  }
  const oldExe = path.join(DEST, 'FREESTREAM.exe');
  if (fs.existsSync(oldExe)) carriedExe = fs.readFileSync(oldExe);
  fs.rmSync(DEST, { recursive: true, force: true });
}
fs.mkdirSync(DEST, { recursive: true });

for (const f of DATA_FOLDERS) ensure(path.join('donnees', f));
for (const d of ['templates', 'outils', 'regies']) ensure(d);

for (const rel of INCLUDE) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) { console.log(yellow('  absent (ignoré) : ' + rel)); continue; }
  const dest = path.join(DEST, rel);
  if (fs.statSync(src).isDirectory()) walk(src, dest);
  else copyFile(src, dest);
}
// L'executable autonome pre-construit n'est PAS un fichier source : il est
// git-ignore, mais s'il est present dans l'atelier on l'ajoute au livrable.
// Tout le monde peut le reconstruire avec CONSTRUIRE-EXE.bat.
const prebuilt = path.join(ROOT, 'FREESTREAM.exe');
if (fs.existsSync(prebuilt) && !has('--sans-exe')) {
  fs.copyFileSync(prebuilt, path.join(DEST, 'FREESTREAM.exe'));
  files++; bytes += fs.statSync(prebuilt).size;
  console.log(green('  + FREESTREAM.exe (autonome, pre-construit)'));
} else if (carriedExe && !has('--sans-exe')) {
  fs.writeFileSync(path.join(DEST, 'FREESTREAM.exe'), carriedExe);
  files++; bytes += carriedExe.length;
  console.log(green('  + FREESTREAM.exe (conservé de l’export précédent)'));
}

for (const f of DATA_FOLDERS) {
  const d = path.join(DEST, 'donnees', f);
  fs.mkdirSync(d, { recursive: true });
  // Garantit que le dossier existe dans l'archive même s'il est vide,
  // sans polluter la liste des médias/chants avec un fichier parasite.
  if (fs.readdirSync(d).length === 0 && f !== 'etat')
    fs.writeFileSync(path.join(d, 'LISEZ-MOI.txt'),
      `FREESTREAM — dossier « ${f} ».\nDéposez ici vos fichiers ${f}. Tout est sauvegardé automatiquement.\n`);
}
for (const d of ['templates', 'regies', 'outils']) fs.mkdirSync(path.join(DEST, d), { recursive: true });

// État vierge mais valide : la régie enverra le sien au premier lancement.
fs.writeFileSync(path.join(DEST, 'donnees', 'etat', 'state.json'), JSON.stringify({ rev: 1, updatedAt: 0 }, null, 2));
fs.writeFileSync(path.join(DEST, 'donnees', 'etat', 'live.js'), 'window.FREESTREAM_STATE={rev:1,live:{tool:null,blackout:false}};');

// Fichier d'accueil Windows (CRLF + BOM pour le Bloc-notes).
function crlf(s) { return '\uFEFF' + s.replace(/\r?\n/g, '\r\n'); }
const version = (() => {
  try { return fs.readFileSync(path.join(ROOT, 'VERSION.txt'), 'utf8').trim(); } catch { return '1.0.0'; }
})();
const lisezMoi = `FREESTREAM ${version} — RÉGIE DE CULTE HORS LIGNE
=================================================

1. DÉMARRER
   Double-cliquez sur DEMARRER.bat.
   Deux fenêtres s'ouvrent :
     • la RÉGIE      : http://localhost:8787/regie.html
     • les LIENS OBS : http://localhost:8787/index.html
   Laissez la fenêtre serveur (minimisée) ouverte pendant le culte.

   Node.js ou Python sont utilisés automatiquement s'ils sont présents.
   S'il n'y en a aucun : cliquez sur « 📂 Mode dossier » dans la régie et
   sélectionnez ce dossier une seule fois (Chrome ou Edge). Tout fonctionne
   alors sans rien installer.

2. DANS OBS
   Ouvrez la page des liens, copiez l'adresse de la sortie voulue, puis dans
   OBS : Sources > + > Source navigateur > collez l'URL.
   Réglez la taille sur 1920×1080 (ou votre résolution de diffusion).
   Le projet travaille en interne en 8K (7680×4320) : le texte reste net
   même si votre écran final est en 1080p.
   Cochez « Fonds transparents » pour laisser passer une caméra derrière.

   Sorties principales :
     plein.html      plein écran universel
     bas.html        bas centré universel
     plein-bible, bas-bible, plein-chants, bas-chants,
     plein-medias, bas-medias, plein-lowerthird, bas-lowerthird
     orateur.html    vue orateur (messages + retour plein écran)
     minuteur.html   sortie minuteur de la régie temps
     custom.html     vos sorties personnalisées (portrait, tailles précises)

3. RACCOURCIS (régie)
   1…9        changer d'outil          F   envoyer en plein écran
   S          envoyer en bas centré    N   noir / rétablir
   ← →        verset ou section        Entrée / Espace  navigation Bible
   Ctrl+Z     annuler                  Ctrl+F  recherche
   Clic droit  menu contextuel sur les éléments

4. BIBLE — saisie ultra-rapide
   Tapez 1 à 2 lettres du livre (« es » → Esther) > Entrée > chapitre >
   Espace > verset > Entrée. Les flèches parcourent les versets ; en mode
   « Découpage bas centré », elles parcourent d'abord les sections du bas
   centré et le plein écran n'avance qu'à la fin de toutes les sections.
   Toutes les mises en forme (gras, italique, couleur, surlignage…) sont
   possibles dans « Texte affiché » et conservées à l'antenne.

5. CHANTS
   Un retour à la ligne = nouvelle ligne de la même section.
   Deux retours à la ligne = nouvelle section.
   Les chants sortent TOUJOURS en grands caractères.

6. MÉDIAS
   Premier clic = aperçu local. Deuxième clic = envoi vers OBS.
   Tout fichier situé hors du projet est copié dans donnees/medias/.
   Pour contrôler un PPTX/DOCX page par page, exportez-le en PDF ou lancez :
       node outils/convertir.mjs diapos mon-fichier.pptx

7. DONNÉES
   donnees/bibles/  donnees/chants/  donnees/lowerthirds/  donnees/medias/
   donnees/projets/ donnees/designs/ donnees/polices/      donnees/etat/
   Tout est sauvegardé automatiquement. Copiez ce dossier pour sauvegarder.

8. IMPORTER UNE BIBLE OU DES CHANTS
       node outils/convertir.mjs bible ma-bible.csv --version "Ma version"
       node outils/convertir.mjs chants mes-chants.txt
   Formats : JSON, CSV, TSV, TXT, OSIS/Zefania/USFX. Aucun réseau requis.
   Les API en ligne gratuites sont OPTIONNELLES : sans elles, tout marche.

Documentation complète : README.md
`;
const notice = fs.existsSync(path.join(ROOT, 'LISEZ-MOI.txt'))
  ? fs.readFileSync(path.join(ROOT, 'LISEZ-MOI.txt'), 'utf8').replace(/^\uFEFF/, '')
  : lisezMoi;
fs.writeFileSync(path.join(DEST, 'LISEZ-MOI.txt'), crlf(notice.replace(new RegExp(`FREESTREAM [0-9.]+`, 'g'), 'FREESTREAM ' + version)), 'utf8');

// Contrôle d'intégrité du livrable.
const must = ['index.html', 'regie.html', 'DEMARRER.bat', 'DIAGNOSTIC.bat',
  'DEMARRER.sh', 'DEMARRER.command', 'server.js', 'server.py', 'server.ps1',
  'outils/DEMARRER.ps1', 'outils/diagnostic.ps1',
  'outputs/plein.html', 'outputs/bas.html', 'outputs/custom.html',
  'outputs/orateur.html', 'outputs/minuteur.html', 'outputs/output.js',
  'core/renderer.js', 'core/store.js', 'regie/app.js', 'LISEZ-MOI.txt'];
const missing = must.filter(f => !fs.existsSync(path.join(DEST, f)));
if (missing.length) {
  console.error(red('\n  Fichiers manquants dans le livrable : ' + missing.join(', ')));
  process.exit(1);
}
// Vérifie que toutes les pages HTML référencent bien des fichiers présents.
let links = 0, bad = 0;
for (const f of fs.readdirSync(DEST, { recursive: true }).filter(n => String(n).endsWith('.html'))) {
  const p = path.join(DEST, String(f));
  let html = fs.readFileSync(p, 'utf8');
  // Les gabarits JS dans les balises <script> ne sont pas des liens statiques.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi)) {
    const u = m[1].trim();
    if (!u || /^(https?:|data:|javascript:|mailto:|about:|blob:)/i.test(u)) continue;
    if (u.includes('${') || u.includes('{{')) continue;   // valeur calculée à l'exécution
    links++;
    const target = path.resolve(path.dirname(p), u);
    // Les raccourcis plein-bible.html etc. sont servis par réécriture du serveur.
    const isAlias = /^(plein|bas)-[a-z]+\.html$/i.test(u);
    if (!fs.existsSync(target) && !isAlias) { console.log(yellow('  lien cassé : ' + f + ' → ' + u)); bad++; }
  }
}

console.log(green('  ✓ Dossier prêt'));
console.log('    Fichiers   : ' + files);
console.log('    Taille     : ' + (bytes / 1024 / 1024).toFixed(2) + ' Mo');
console.log('    Liens      : ' + links + ' vérifiés' + (bad ? yellow(' — ' + bad + ' cassé(s)') : green(' — OK')));
console.log('    Ignorés    : ' + skipped + ' (développement / cache / fichiers temporaires)');

if (has('--zip')) {
  const zip = DEST + '.zip';
  const parent = path.dirname(DEST), base = path.basename(DEST);
  if (process.platform === 'win32') {
    spawnSync('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Path '${DEST}' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' });
  } else {
    spawnSync('zip', ['-qr', zip, base], { cwd: parent, stdio: 'inherit' });
  }
  if (fs.existsSync(zip)) console.log(green('  ✓ Archive : ' + zip));
  else console.log(yellow('  Archive non créée (outil zip absent).'));
}

console.log('\n  Copiez ce dossier à la racine de C:\\ puis lancez DEMARRER.bat.');
console.log('  Pour tester immédiatement : ' + dim('node outils/exporter.mjs --dest dist/FREESTREAM && node dist/FREESTREAM/server.js 8790'));
console.log();
if (bad) process.exit(2);
