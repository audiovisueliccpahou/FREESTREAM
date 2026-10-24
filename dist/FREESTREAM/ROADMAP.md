# FREESTREAM — feuille de route

> **Note importante.** Une première ébauche de ce fichier décrivait une application
> de bureau Electron/Tauri. **Cette orientation est abandonnée :** FREESTREAM est un
> **projet web 100 % hors ligne**, livré sous forme de dossier à copier à la racine
> de `C:\`, utilisé avec **OBS** via de simples sources navigateur. Ce document
> reflète uniquement cette architecture.

Légende : ✅ livré et testé · 🟡 partiel, à renforcer · ⬜ optionnel / futur

---

## A. Socle et livraison

| Élément | État | Preuve |
|---|---|---|
| Dossier complet `C:\FREESTREAM\` | ✅ | `outils/exporter.mjs --dest C:\FREESTREAM` |
| `DEMARRER.bat` (Node / Python / mode dossier) | ✅ | 3 branches de repli, testées |
| `DEMARRER.sh` (macOS / Linux) | ✅ | — |
| Serveur Node zéro dépendance | ✅ | `tests/http.test.mjs` 23/23 |
| Serveur Python de repli (bibliothèque standard) | ✅ | santé, pages, patch, Range, upload, sécurité |
| **Mode dossier sans aucune installation** | ✅ | API File System Access → `live.js` |
| `LISEZ-MOI.txt`, `VERSION.txt`, `README.md` | ✅ | — |
| Vérification des liens internes à l'export | ✅ | tous les `src`/`href` résolus |

## B. Sorties OBS

| Élément | État | Preuve |
|---|---|---|
| Canevas logique 8K `7680 × 4320` | ✅ | `CANVAS_8K` |
| Deux modèles de base modifiables : plein / bas centré | ✅ | `outputs/plein.html`, `outputs/bas.html` |
| Liens universels + lien dédié par outil (×4 outils, ×2) | ✅ | 12 sorties, priorité `?tool=` |
| Sorties personnalisées (portrait, taille précise) | ✅ | `outputs/custom.html?id=…`, copie du design plein |
| Fonds vides transparents (caméra derrière) | ✅ | `tests/render.test.mjs` |
| HTTP Range pour les longues vidéos | ✅ | `206 bytes 0-99/25091` |
| Résistance aux sources OBS masquées (animations figées) | ✅ | correctif `core/renderer.js` |
| Résistance à la coupure serveur (`live.js`) | ✅ | `core/store.js` |

## C. Outils

### Bible ✅
Saisie 1–2 lettres → suggestions → Entrée → chapitre → Espace → verset → Entrée.
Flèches verset suivant/précédent. Découpage long en bas centré (**Esther 8:9 =
4 sections**, 117/115/115/107), plein écran qui attend la fin des sections, option
« plein = bas ». Mise en forme riche, favoris, recherche référence/mots-clés,
paraphrase, annotations. Jusqu'à 3 versions empilées, changement de version sans
déplacer le verset. Import local multi-format + API gratuites **optionnelles**.

### Chants ✅
CRUD complet, renommage, duplication, recherche, import/export multi-format.
1 retour = ligne, 2 retours = section. **Sortie toujours en grands caractères.**
Vidéos de fond + calques de couleur.

### Médias ✅
Vidéos, PPTX, PDF, images, audio, Word/présentations, YouTube/live/liens.
1er clic = aperçu, 2ᵉ clic = OBS. Deux previews (locale + OBS). Boutons ‹ ›,
démarrage à un temps donné, avec/sans son, optimisation 30 min via Range.
Copie automatique de tout fichier hors projet dans `donnees/medias/`.

🟡 **À renforcer** : la conversion PPTX/DOCX → PDF/PNG dépend de LibreOffice et de
`pdftoppm` présents sur la machine. Un message clair et le repli PDF sont déjà en
place ; une conversion 100 % interne sans outil externe reste un chantier futur.

### Lowerthirds ✅
4ᵉ calque indépendant. Contenu éditable, image de fond, texte dessus, **durée
d'affichage** (secondes → ms, `lowerthirdRemainingMs()`), transitions type
PowerPoint, cible `bas`/`plein`/`les deux`, extinction automatique, CRUD complet.

## D. Designs ✅
8 designs indépendants (4 outils × 2). Calques, zones de texte indépendantes,
fond immobile, ajustement automatique de police, transparence, boutons
position/taille/police. **Même moteur** pour éditeur, aperçus et OBS — déterminisme
prouvé par `tests/render.test.mjs` (16/16).

## E. Vues spéciales

| Élément | État |
|---|---|
| Vue orateur : reçoit le plein écran | ✅ |
| Messages 15 s avec transition *move*, coupure régie | ✅ |
| Coin bas pendant un message, retour total ensuite | ✅ |
| Régie minuteur séparée, trame enregistrable | ✅ |
| Sortie noire + décompte, dépassement négatif `−00:15` | ✅ |
| Boutons live ±30 s / 1 / 5 / 10 / 30 min / 1 h | ✅ |
| Pointillés clignotants quand rien n'est affiché | ✅ |

## F. Sauvegarde, recherche, raccourcis ✅
Sauvegarde automatique navigateur (IndexedDB) + dossier (`donnees/…`) à chaque
entrée. Un dossier par chose. Recherche / modification / renommage / suppression /
duplication pour chaque outil. Suggestions immédiates Bible et chants.
Raccourcis `1…9`, `Entrée`, `Espace`, `←→`, `F`, `S`, `N`, `Ctrl+Z`, `Ctrl+F`,
clic droit, loupe 1:1 sur les aperçus.

## G. Qualité et tests

| Suite | Résultat |
|---|---|
| `tests/unit.test.mjs` | ✅ 66/66 |
| `tests/render.test.mjs` | ✅ 18/18 |
| `tests/http.test.mjs` | ✅ 25/25 |
| `tests/python.test.mjs` | ✅ 10/10 |
| `tests/powershell.test.mjs` | ✅ 6/6 (syntaxe analysée en WASM) |
| `tests/ui.test.mjs` | ✅ 9/9 |
| `tests/browser.test.mjs` | ✅ 12/12 (vrai Chromium) |
| **TOTAL** | ✅ **146/146** |
| Parcours réel Chromium headless | ✅ régie → plein + bas + Cœur, 0 erreur console |
| Sécurité traversée de dossiers | ✅ `400` sur dossier inconnu, noms neutralisés (Node, Python, PowerShell) |

✅ Les handles jsdom sont nettoyés : `npm test` se termine proprement, sans
`--test-force-exit`. Ce flag a été retiré car il **tronquait silencieusement**
`unit.test.mjs` (66 tests n'en donnaient plus que 34).

## G bis. Démarrage un-clic, affichage maximal, sortie Cœur

| Élément | État | Détail |
|---|---|---|
| `DEMARRER.bat` (Windows) | ✅ | Appelle `outils/DEMARRER.ps1` ; replis Node/Python/mode dossier si PowerShell absent |
| `DEMARRER.command` (macOS) | ✅ | Double-cliquable depuis le Finder |
| `DEMARRER.sh` (Linux) | ✅ | Vérifications + installation optionnelle + contrôle de santé |
| Orchestrateur PowerShell | ✅ | Détecte moteurs et navigateur, attend `/api/health`, propose winget, ouvre les 2 pages, repli mode dossier |
| Serveur PowerShell intégré | ✅ | `server.ps1`, mêmes routes, zéro installation sur Windows ; syntaxe validée par grammaire WASM |
| Installation automatique si besoin | ✅ | winget (Windows) / Homebrew, xcode-select, apt, dnf, pacman, apk — **avec accord explicite** |
| Repli ultime sans rien installer | ✅ | `?mode=dossier` ouvre une boîte de dialogue d'autorisation dans la régie |
| Maximisation de l'interface | ✅ | `⛶ Max` / F11 (plein écran) + `◧ Aperçus` (repli du panneau) |
| Remplissage maximal des textes | ✅ | Case « ⛶ Remplissage maximal » dans Designs, calculé dans le moteur unique |
| **Vignette de fond média** | ✅ | Image/vidéo non-16:9 → copie floutée + dégradé radial comble tout l'écran, média net non recadré au premier plan |
| Option « Remplir (recadrer) » | ✅ | Passe le calque média en `object-fit: cover` |
| **Sortie Cœur** | ✅ | `outputs/coeur.html`, design `chants:coeur`, section courante en gros + section suivante en bas, 2 aperçus dans la régie |
| Cœur collant | ✅ | Survit à un envoi Bible/Média ; `?sticky=0` pour désactiver |
| Bouton « ♥ Cœur seul » | ✅ | Envoie le Cœur sans toucher au plein écran ni au bas centré |

## H. Chantiers restants (optionnels, non bloquants)

- 🟡 Validation manuelle sur un poste **Windows réel avec OBS** : le sandbox
  n'a ni Windows ni OBS. La **syntaxe** de `server.ps1` / `DEMARRER.ps1` est
  validée par la grammaire tree-sitter officielle, le comportement du serveur
  est couvert par les mêmes tests appliqués à Node et Python, et le lanceur
  **contrôle `/api/health`** avant d'ouvrir le navigateur : s'il ne démarre pas,
  il bascule automatiquement en mode dossier. Protocole au § 9 du `README.md`.
- ⬜ Catalogue d'API bibliques en ligne préconfiguré (l'intégration existe, les
  endpoints restent à choisir selon les préférences de l'équipe).
- 🟡 `decodeRtf()` de `core/songs-utils.js` utilise encore `Buffer` : fonctionne
  côté Node/outil de conversion, à remplacer par un décodage navigateur pour un
  import RTF direct depuis la régie.
- ⬜ Rendu interne PPTX/DOCX sans dépendance externe (actuellement via LibreOffice).
- ⬜ Export/import d'un projet complet (trame + designs + chants) en un seul fichier.

---

**Principe directeur :** aucune fonctionnalité annoncée ne doit rester « à moitié ».
Ce qui est marqué ✅ a été exercé par un test ou par un parcours navigateur réel ;
ce qui ne l'est pas encore est explicitement listé ci-dessus.
