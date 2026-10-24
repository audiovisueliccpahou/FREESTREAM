/**
 * Validation RÉELLE de la syntaxe PowerShell (server.ps1 + DEMARRER.ps1).
 * Le sandbox tourne sous Linux : on ne peut pas exécuter PowerShell, mais on
 * analyse les deux fichiers avec la grammaire officielle tree-sitter-powershell
 * compilée en WASM (celle qu'utilise VS Code). Une erreur de syntaxe =
 * ERROR/MISSING dans l'arbre = test rouge.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
let Parser, Language, parser = null, unavailable = '';

try {
  ({ Parser, Language } = await import('web-tree-sitter'));
  await Parser.init();
  const wasm = path.join(ROOT, 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm', 'tree-sitter-powershell.wasm');
  if (!fs.existsSync(wasm)) throw new Error('grammaire WASM absente (npm install)');
  const lang = await Language.load(wasm);
  parser = new Parser();
  parser.setLanguage(lang);
} catch (e) { unavailable = e.message; }

function problems(src) {
  const tree = parser.parse(src);
  const bad = [];
  let count = 0;
  (function walk(n) {
    count++;
    if (n.type === 'ERROR' || n.isMissing) bad.push({ type: n.type, row: n.startPosition.row, text: src.slice(n.startIndex, n.startIndex + 100).replace(/\r?\n/g, '⏎') });
    for (const c of n.children) walk(c);
  })(tree.rootNode);
  return { bad, count };
}

describe('Scripts PowerShell (Windows, zéro installation)', () => {
  const files = ['server.ps1', path.join('outils', 'DEMARRER.ps1'), path.join('outils', 'diagnostic.ps1')];
  for (const f of files) {
    test(`${f} : syntaxe PowerShell valide`, (t) => {
      if (!parser) return t.skip('grammaire WASM indisponible : ' + unavailable);
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '');
      assert.ok(src.length > 500, 'fichier non vide');
      const { bad, count } = problems(src);
      assert.ok(count > 100, `arbre syntaxique substantiel (${count} nœuds)`);
      assert.deepEqual(bad, [], 'aucune erreur de syntaxe : ' + JSON.stringify(bad.slice(0, 5), null, 1));
    });
  }

  test('server.ps1 expose les routes indispensables et la sécurité des dossiers', () => {
    const s = fs.readFileSync(path.join(ROOT, 'server.ps1'), 'utf8');
    for (const route of ['/api/health', '/api/state', '/api/patch', '/api/events', '/api/list',
      '/api/save', '/api/delete', '/api/duplicate', '/api/rename', '/api/upload', '/api/presence', '/api/shutdown']) {
      assert.ok(s.includes(route), 'route manquante : ' + route);
    }
    assert.ok(/Folder-Dir/.test(s), 'validation des dossiers déclarés');
    assert.ok(/Safe-Name/.test(s), 'neutralisation des noms de fichiers');
    assert.ok(/Accept-Ranges/.test(s), 'HTTP Range pour les longues vidéos');
    assert.ok(/http:\/\/localhost:/.test(s), 'écoute locale uniquement');
  });

  test('DEMARRER.ps1 : vérifications, repli PowerShell, installation optionnelle, navigateur', () => {
    const s = fs.readFileSync(path.join(ROOT, 'outils', 'DEMARRER.ps1'), 'utf8');
    assert.ok(/Get-Command/.test(s), 'vérification des moteurs disponibles');
    assert.ok(/server\.ps1/.test(s), 'repli PowerShell intégré (zéro installation)');
    assert.ok(/Test-Health|api\/health/.test(s), 'attente de la santé du serveur avant ouverture');
    assert.ok(/winget/.test(s), 'installation optionnelle de Node.js');
    assert.ok(/chrome\.exe|msedge\.exe/.test(s), 'détection du navigateur');
    assert.ok(/mode=dossier/.test(s), 'repli ultime en mode dossier');
    assert.ok(/regie\.html/.test(s) && /index\.html/.test(s), 'ouverture régie + liens OBS');
  });

  test('DEMARRER.bat appelle l’orchestrateur et garde un repli sans PowerShell', () => {
    const s = fs.readFileSync(path.join(ROOT, 'DEMARRER.bat'), 'utf8');
    assert.ok(/DEMARRER\.ps1/.test(s), 'orchestrateur PowerShell appelé');
    assert.ok(/ExecutionPolicy Bypass/.test(s), 'politique d’exécution contournée sans modifier le système');
    assert.ok(/node server\.js/.test(s) && /server\.py/.test(s), 'replis Node / Python');
    assert.ok(/mode=dossier/.test(s), 'repli mode dossier');
  });

  test('DEMARRER.sh / DEMARRER.command : syntaxe bash valide', () => {
    for (const f of ['DEMARRER.sh', 'DEMARRER.command']) {
      const r = spawnSync('bash', ['-n', f], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(r.status, 0, `${f} : ${r.stderr}`);
    }
  });
});


/* -------------------------------------------------------------------------
 * REGRESSION Windows : la fenêtre noire qui se fermait sans rien dire.
 * Trois causes reelles identifiees et corrigees.
 * ---------------------------------------------------------------------- */
describe('Regression Windows - plus de fenêtre noire qui se ferme', () => {
  const ps1 = ['server.ps1', path.join('outils', 'DEMARRER.ps1'), path.join('outils', 'diagnostic.ps1')];

  test('chaque .ps1 a un BOM UTF-8 (sinon PS 5.1 le lit en ANSI)', () => {
    for (const f of ps1) {
      const b = fs.readFileSync(path.join(ROOT, f));
      assert.ok(b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF, `${f} : BOM UTF-8 manquant`);
    }
  });

  test('chaque .ps1 est ASCII pur hors BOM : aucun smart-quote possible', () => {
    // C'est LA cause du crash : un tiret long ou une fleche UTF-8 relu en
    // Windows-1252 produit un guillemet typographique que PowerShell 5.1
    // considere comme un delimiteur de chaine -> parsing casse.
    for (const f of ps1) {
      let b = fs.readFileSync(path.join(ROOT, f));
      b = b.subarray(3);                       // on retire le BOM
      const nonAscii = [...b].filter(x => x > 127);
      assert.equal(nonAscii.length, 0, `${f} contient ${nonAscii.length} octet(s) non-ASCII`);
    }
  });

  test('chaque .ps1 est en CRLF', () => {
    for (const f of ps1) {
      const b = fs.readFileSync(path.join(ROOT, f));
      const lf = [...b].filter(x => x === 10).length;
      const crlf = b.includes(Buffer.from([13, 10]));
      assert.ok(crlf, `${f} : pas de CRLF`);
      assert.ok(b.filter(x => x === 10).length === b.filter(x => x === 13).length,
        `${f} : fins de ligne melangees (${lf} LF)`);
    }
  });

  test('simulation ANSI : aucun smart-quote ne peut apparaitre', () => {
    // Windows-1252 : 0x93/0x94 = “ ”, 0x91/0x92 = ‘ ’. PowerShell 5.1 traite
    // CES caracteres comme des delimiteurs de chaine. Comme nos fichiers sont
    // ASCII pur, aucun octet > 127 ne peut en produire.
    for (const f of ps1) {
      let b = fs.readFileSync(path.join(ROOT, f)).subarray(3);
      for (const octet of [0x91, 0x92, 0x93, 0x94]) {
        assert.ok(!b.includes(octet), `${f} : l'octet 0x${octet.toString(16)} devient un smart-quote en ANSI`);
      }
    }
  });

  test('les .bat sont ASCII pur et sans chcp 65001', () => {
    for (const f of ['DEMARRER.bat', 'DIAGNOSTIC.bat']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.equal([...s].filter(c => c.codePointAt(0) > 127).length, 0, `${f} doit rester ASCII`);
      const actives = s.split(/\r?\n/).filter(l => !/^\s*(rem|::)/i.test(l)).join('\n');
      assert.ok(!/chcp\s+65001/i.test(actives), `${f} : chcp 65001 casse la relecture du batch`);
      assert.ok(/pause/.test(s), `${f} : doit toujours laisser le temps de lire`);
    }
  });

  test('DEMARRER.bat ne sort plus sur un %errorlevel% developpe trop tot', () => {
    const s = fs.readFileSync(path.join(ROOT, 'DEMARRER.bat'), 'utf8');
    // Le bug : exit /b %errorlevel% DANS un bloc if (...) est developpe avant
    // l'execution de PowerShell -> sortie avec 0 meme en cas d'echec.
    assert.ok(!/exit\s+\/b\s+%errorlevel%/i.test(s),
      'interdit : exit /b %errorlevel% (evaluation anticipee)');
    assert.ok(/if\s+errorlevel\s+1\s+goto\s+:psfail/i.test(s),
      'le code retour de PowerShell doit etre teste HORS de tout bloc');
    assert.ok(/goto\s+:fallback/i.test(s), 'un repli doit exister si PowerShell echoue');
    assert.ok(/:nofolder/i.test(s), 'le dossier introuvable doit etre signale');
    assert.ok((s.match(/goto\s+:fin/gi) || []).length >= 3, 'tous les chemins convergent vers :fin');
    assert.ok(/pause\s*>nul/.test(s), 'pause finale inconditionnelle');
  });

  test('tous les goto du .bat pointent vers un label existant', () => {
    for (const f of ['DEMARRER.bat', 'DIAGNOSTIC.bat']) {
      const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const labels = new Set([...txt.matchAll(/^\s*:([A-Za-z0-9_]+)\s*$/gm)].map(m => m[1].toLowerCase()));
      const gotos = [...txt.matchAll(/\bgoto\s+:([A-Za-z0-9_]+)/gi)].map(m => m[1].toLowerCase());
      assert.ok(labels.size >= 3, `${f} : labels manquants`);
      for (const g of gotos) assert.ok(labels.has(g), `${f} : goto :${g} sans label`);
    }
  });

  test('DIAGNOSTIC.bat existe et analyse reellement la syntaxe PowerShell', () => {
    const bat = fs.readFileSync(path.join(ROOT, 'DIAGNOSTIC.bat'), 'utf8');
    assert.ok(/diagnostic\.ps1/.test(bat));
    assert.ok(/pause/.test(bat));
    const d = fs.readFileSync(path.join(ROOT, 'outils', 'diagnostic.ps1'), 'utf8').replace(/^\uFEFF/, '');
    assert.ok(/Parser\]::ParseFile/.test(d), 'verification de syntaxe integree');
    assert.ok(/Get-ExecutionPolicy/.test(d), 'politique d execution remontee');
    assert.ok(/BOM/.test(d), 'controle du BOM');
    assert.ok(/api\/health/.test(d), 'test reel du serveur');
    assert.ok(/DIAGNOSTIC\.txt/.test(d), 'rapport ecrit sur disque');
  });

  test('le diagnostic ne peut pas disparaitre : il ferme sur pause', () => {
    const s = fs.readFileSync(path.join(ROOT, 'DIAGNOSTIC.bat'), 'utf8');
    assert.ok(s.indexOf('pause') > s.indexOf('diagnostic.ps1'), 'pause apres le rapport');
  });
});


/* ------------------------------------------------- le dossier LIVRE, pas la source */
describe('Livrable dist/FREESTREAM - memes garanties Windows', () => {
  const D = path.join(ROOT, 'dist', 'FREESTREAM');
  const present = fs.existsSync(path.join(D, 'DEMARRER.bat'));

  test('le livrable contient les lanceurs et le diagnostic', (t) => {
    if (!present) return t.skip('dist non encore genere (node outils/exporter.mjs)');
    for (const f of ['DEMARRER.bat', 'DIAGNOSTIC.bat', 'DEMARRER.sh', 'DEMARRER.command',
      'server.ps1', path.join('outils', 'DEMARRER.ps1'), path.join('outils', 'diagnostic.ps1')]) {
      assert.ok(fs.existsSync(path.join(D, f)), 'manquant dans le livrable : ' + f);
    }
  });

  test('les .ps1 LIVRES gardent leur BOM UTF-8', (t) => {
    if (!present) return t.skip('dist non encore genere');
    for (const f of ['server.ps1', path.join('outils', 'DEMARRER.ps1'), path.join('outils', 'diagnostic.ps1')]) {
      const b = fs.readFileSync(path.join(D, f));
      assert.ok(b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF, `${f} livre sans BOM`);
      assert.equal([...b.subarray(3)].filter(x => x > 127).length, 0, `${f} livre avec des octets non-ASCII`);
    }
  });

  test('les .bat LIVRES sont en CRLF', (t) => {
    if (!present) return t.skip('dist non encore genere');
    for (const f of ['DEMARRER.bat', 'DIAGNOSTIC.bat']) {
      const b = fs.readFileSync(path.join(D, f));
      const lf = [...b].filter(x => x === 10).length;
      const crlf = (b.toString('latin1').match(/\r\n/g) || []).length;
      assert.equal(lf, crlf, `${f} : ${lf} LF mais seulement ${crlf} CRLF`);
      assert.ok(crlf > 10);
    }
  });
});
