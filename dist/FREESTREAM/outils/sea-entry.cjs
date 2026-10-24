/*
 * FREESTREAM.exe - amorce de l'executable autonome (Node SEA).
 * Methode inspiree de renaudchristinfonton-bj/Openpresenter
 * (servergestionobs/build-exe-windows.bat), adaptee a FREESTREAM.
 *
 * On ne met VOLONTAIREMENT aucun code serveur dans le blob SEA : le dossier
 * complet reste a cote de l'exe, et on charge server.js depuis le disque.
 * L'exe sert de moteur Node integre + d'amorcage. Donc :
 *   - aucun script .bat / .ps1 a interpreter, aucune police d'execution ;
 *   - le blob reste compatible avec la version de Node qui l'a construit ;
 *   - les mises a jour se font en remplacant simplement server.js.
 *
 * FREESTREAM_ROOT permet de tester l'amorce depuis un autre dossier.
 */
'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const dir = process.env.FREESTREAM_ROOT || path.dirname(process.execPath);
try { process.chdir(dir); } catch { /* dossier inamovible : on continue */ }

// Le .exe double-clique ouvre la regie tout seul, comme le fait le .bat.
if (!process.env.FREESTREAM_OPEN) process.env.FREESTREAM_OPEN = '1';

const cible = path.join(dir, 'server.js');
import(pathToFileURL(cible).href).catch((e) => {
  console.error('');
  console.error('  [ERREUR] Impossible de charger server.js');
  console.error('  ' + ((e && e.message) ? e.message : String(e)));
  console.error('  Verifiez que server.js est bien a cote de FREESTREAM.exe.');
  console.error('  Dossier tente : ' + dir);
  console.error('');
  process.exit(1);
});
