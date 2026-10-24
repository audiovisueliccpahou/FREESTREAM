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
  const files = ['server.ps1', path.join('outils', 'DEMARRER.ps1')];
  for (const f of files) {
    test(`${f} : syntaxe PowerShell valide`, (t) => {
      if (!parser) return t.skip('grammaire WASM indisponible : ' + unavailable);
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
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
