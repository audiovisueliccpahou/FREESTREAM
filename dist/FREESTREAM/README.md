# FREESTREAM

**Régie de culte web, 100 % hors ligne, pensée pour OBS.**

Un simple dossier à copier à la racine de `C:\`. Aucun compte, aucun CDN, aucune
dépendance obligatoire, aucune installation. On double-clique sur `DEMARRER.bat`,
on colle des liens dans des **sources navigateur OBS**, et on régie depuis Chrome/Edge.

Rendu interne **8K (7680 × 4320)** : le texte reste net même si la diffusion finale
est en 1920 × 1080. Le même moteur de rendu est utilisé par l'éditeur, les aperçus
et OBS — ce que vous voyez en préparation est exactement ce qui part à l'antenne.

---

## 1. Démarrage en 30 secondes

| Situation | Action |
|---|---|
| **Windows** | Double-clic `DEMARRER.bat` |
| **macOS** | Double-clic `DEMARRER.command` |
| **Linux** | `./DEMARRER.sh` |
| Développement | `node server.js 8787` |

**Le lanceur fait toutes les vérifications tout seul.** Il détecte le dossier et
le navigateur, choisit **Node.js → Python → serveur PowerShell intégré à Windows**
(donc *rien à installer* dans la grande majorité des cas), **propose d'installer
Node.js** si aucun moteur ne répond (winget / Homebrew / apt / dnf, avec votre
accord et une connexion Internet), **attend que `/api/health` réponde** avant
d'ouvrir quoi que ce soit, puis ouvre la régie **et** la page des liens OBS.
Si tout échoue, il ouvre quand même la régie en **mode dossier** : zéro
installation, zéro réseau. Un journal est écrit dans `demarrage.log`.

| Moteur | Disponibilité | Fichier |
|---|---|---|
| Node.js | si installé (recommandé, sync instantanée SSE) | `server.js` |
| Python 3 | si installé (répli complet, même API) | `server.py` |
| PowerShell 5.1 | **toujours présent sur Windows 10/11** | `server.ps1` |
| Aucun | **mode dossier** via l'API File System Access de Chrome/Edge | — |

Les trois serveurs exposent **exactement les mêmes routes**, appliquent les
mêmes règles de sécurité et sont testés (`tests/http.test.mjs`,
`tests/python.test.mjs`, `tests/powershell.test.mjs` — ce dernier analyse la
syntaxe PowerShell avec la grammaire WASM officielle de VS Code).

Deux pages s'ouvrent :

- **Régie** — `http://localhost:8787/regie.html` (là où l'on prépare et envoie)
- **Liens OBS** — `http://localhost:8787/index.html` (toutes les URLs à copier)

Le serveur n'écoute que sur la machine/réseau local. Il n'envoie rien sur Internet.
Le dossier minimize une petite fenêtre serveur : **ne la fermez pas pendant le culte**.

### Sans aucun moteur installé — le « mode dossier »

Si ni Node.js ni Python ne sont présents, la régie le détecte et affiche le bouton
**📂 Mode dossier**. Cliquez dessus une seule fois, sélectionnez le dossier
FREESTREAM : l'API File System Access de Chrome/Edge autorise alors la régie à écrire
elle-même `donnees/etat/live.js`. Les sorties OBS relisent ce fichier en boucle.
Résultat : **zéro installation, zéro réseau, tout fonctionne**.

---

## 2. Les sorties OBS

Ouvrez `index.html` : chaque sortie y est listée avec un bouton **Copier**.
Dans OBS : `Sources > + > Source navigateur > coller l'URL`.

| URL | Rôle |
|---|---|
| `outputs/plein.html` | Plein écran universel (Bible, Chants, Médias se relayent) |
| `outputs/bas.html` | Bas centré universel |
| `outputs/plein.html?tool=bible` | Plein écran dédié Bible |
| `outputs/bas.html?tool=bible` | Bas centré dédié Bible |
| `outputs/plein.html?tool=chants` | Plein écran dédié Chants |
| `outputs/bas.html?tool=chants` | Bas centré dédié Chants |
| `outputs/plein.html?tool=medias` | Plein écran dédié Médias |
| `outputs/bas.html?tool=medias` | Bas centré dédié Médias |
| `outputs/plein.html?tool=lowerthird` | Plein écran dédié Lowerthirds |
| `outputs/bas.html?tool=lowerthird` | Bas centré dédié Lowerthirds |
| `outputs/coeur.html` | **CŒUR** — chants en gros + section suivante en bas |
| `outputs/orateur.html` | Vue orateur |
| `outputs/minuteur.html` | Sortie minuteur noire + décompte |
| `outputs/custom.html?id=…` | Sortie personnalisée (portrait, taille précise…) |

Les raccourcis `plein-bible.html`, `bas-chants.html`… fonctionnent aussi.

**Réglages OBS conseillés**

- Largeur / hauteur : `1920 × 1080` (ou votre résolution de diffusion).
- Cochez **Fonds transparents** pour laisser passer une caméra derrière.
  Tous les fonds vides sont réellement `transparent`.
- Laissez **« Arrêter la source quand elle n'est pas visible »** décoché si vous
  voulez éviter un rechargement ; le moteur gère quand même le cas (voir § 8).
- Pour une machine distante, remplacez `localhost` par l'adresse IP locale
  indiquée dans la régie.

**Pourquoi 8K alors que j'émets en 1080p ?** Le canevas logique fait 7680 × 4320.
Le navigateur le met à l'échelle exacte de la source OBS. Un texte dimensionné en 8K
descend en 1080p sans perte, reste parfaitement lisible, et ne « bave » pas. Le
paramètre `?tool=` est prioritaire sur l'attribut `data-tool` de la page : une même
page sert donc à tous les outils sans duplication de code.

---

## 3. Les quatre outils

Onglets `1` à `4` (ou clic). Chacun possède **ses propres designs plein / bas** et
**ses propres liens de sortie**.

### 3.1 Bible — `1`

Saisie la plus rapide possible :

1. Tapez **1 à 2 lettres** du livre → suggestions classées par proximité
   (`es` → **Esther**, `jn` → Jean, `1co` → 1 Corinthiens).
2. **Entrée** → sélectionne le premier livre et place le curseur dans *Chapitre*.
3. Numéro de chapitre, **Espace**, numéro de verset, **Entrée** → affichage.
4. **← / →** : verset précédent / suivant.

**Découpage spécial bas centré.** Les versets longs sont coupés en sections selon
leur longueur. Exemple réel : **Esther 8:9** (457 caractères) → **4 sections** de
117 / 115 / 115 / 107 caractères, chacune tenant à `font-size: 186` dans la zone
du bas centré. Les flèches font d'abord défiler **les sections du bas centré** ;
le plein écran **ne bouge pas** tant que toutes les sections n'ont pas été
affichées, puis il avance avec le verset suivant. L'option
**« Plein = bas (grand) »** applique le même découpage en plein écran.

**Mise en forme riche type Word** : gras, italique, souligné, barré, exposant/indice,
couleur du texte, surlignage, augmentation/diminution de la taille, effacement.
Toute modification est conservée à l'antenne et enregistrée pour ce verset et
cette version.

**Versions** : jusqu'à **3 versions empilées** l'une sous l'autre. Changer de version
**ne déplace pas le verset** : la référence reste, seul le texte change. Import local
(JSON, CSV, TSV, TXT, OSIS, Zefania, USFX) via `outils/convertir.mjs`, et API en
ligne gratuites intégrées **en option** — jamais nécessaires au fonctionnement.

Aussi : favoris, recherche par référence, recherche par mot-clé, paraphrase,
annotations (parenthèses, texte ajouté…).

### 3.2 Chants — `2`

Ajout, édition, renommage, suppression, **duplication réelle**, recherche, import,
export, formats multiples (texte, ChordPro, JSON, FreeShow, ProPresenter).

L'éditeur analyse la saisie :

- **un seul retour à la ligne** → nouvelle ligne dans la même section ;
- **deux retours à la ligne** → nouvelle section.

Les chants sortent **toujours en GRANDS CARACTÈRES**, même s'ils ont été saisis en
minuscules. Vidéos de fond possibles, avec calques de couleur pour préserver la
lisibilité. Mises en forme type Word/PowerPoint.

### 3.3 Médias — `3`

Vidéos, PPTX, PDF, images, audio, documents Word / présentations, liens YouTube,
live et liens média contrôlables.

- **Premier clic = aperçu local.** **Deuxième clic = envoi vers OBS.**
- Deux écrans de preview dans la régie : *TRAVAIL* (ce que vous préparez) et
  *À L'ANTENNE* (la vraie page de sortie, en iframe — donc identique à OBS).
- Boutons **‹ ›** pour changer de page : PDF/iframe via `page=`, vidéos via la
  commande de saut. Commandes lecture / pause / muet / volume / recherche.
- Démarrage à un temps donné, avec ou sans son, qualité maximale.
- **HTTP Range** sur le serveur : une vidéo de 30 min n'est pas téléchargée en
  entier, le navigateur lit à la demande.
- **Tout fichier hors projet est copié** dans `donnees/medias/`.

Pour un PPTX/DOCX contrôlable page par page : `node outils/convertir.mjs diapos
mon-fichier.pptx` (LibreOffice → PDF → PNG). Sans LibreOffice, exportez en PDF :
les boutons ‹ › fonctionnent directement sur le PDF.

**Remplissage maximal — plus aucune bande noire.** Quand une image ou une vidéo
ne fait pas 1920×1080 (portrait, 4:3, diaporama…), FREESTREAM comble **tout le
canevas** avec une **vignette floutée inspirée du média lui-même** (copie très
agrandie, floutée et assombrie + dégradé radial), et garde le média réel **net
au premier plan, sans recadrage**. Deux réglages dans l'onglet Médias :
*Vignette de fond* et *Remplir (recadrer)*. Le calcul est fait dans le moteur
unique, donc identique en preview et dans OBS.

Pour les textes, l'onglet **Designs** propose « **⛶ Remplissage maximal** » :
les marges des zones principales sont réduites et la police est agrandie
automatiquement par l'ajustement. La régie dispose aussi de **⛶ Max** (F11)
pour passer en plein écran et de **◧ Aperçus** pour replier le panneau de droite
et donner toute la largeur à l'éditeur.

### 3.3 bis. Dépannage Windows : plus de fenêtre noire qui se ferme

**Symptôme rencontré** : au lancement de `DEMARRER.bat` (même en administrateur),
une fenêtre noire apparaît et se ferme aussitôt, sans message.

**Trois causes réelles, toutes corrigées :**

| Cause | Pourquoi ça cassait | Correctif |
|---|---|---|
| `exit /b %errorlevel%` **dans** un bloc `if (...)` | `cmd.exe` développe `%errorlevel%` **avant** d'exécuter PowerShell : il valait donc toujours 0. Même en cas de plantage, le script sortait « avec succès » et la fenêtre disparaissait, sans aucun `pause`. | Structure plate en `goto` : le code retour est testé **hors** de tout bloc (`if errorlevel 1 goto :psfail`), l'erreur est affichée, puis un repli est tenté. **Tous** les chemins passent par `:fin` qui contient un `pause`. |
| Fichiers `.ps1` **sans BOM UTF-8** | Windows PowerShell 5.1 lit un `.ps1` sans BOM en **ANSI/Windows-1252**. Un tiret long `—` ou une flèche `→` décodé ainsi devient un **guillemet typographique** (`“`/`”`) que PowerShell traite comme un vrai délimiteur de chaîne → déséquilibre → erreur de parsing. | Les trois `.ps1` sont désormais **ASCII pur + BOM UTF-8 + CRLF**, et l'export garantit ces trois propriétés. Même si un éditeur perd le BOM, le fichier reste analysable. |
| `chcp 65001` en tête du batch | Perturbe la relecture du `.bat` sur certains Windows. | Supprimé : le `.bat` est 100 % ASCII, il n'a pas besoin de changer de page de codes. |

**Outil de diagnostic fourni : `DIAGNOSTIC.bat`.** Il ne se ferme jamais seul et
vérifie concrètement :

- présence des 12 fichiers indispensables ;
- **encodage + syntaxe PowerShell analysée par le parseur officiel**
  (`[System.Management.Automation.Language.Parser]::ParseFile`) avec numéro de ligne ;
- politique d'exécution PowerShell (et avertissement si une GPO la force) ;
- moteurs Node / Python / winget, navigateur Chrome/Edge ;
- **démarrage réel** du serveur PowerShell sur un port temporaire + test
  `/api/health`, puis arrêt propre ;
- occupation du port 8787.

Il affiche tout à l'écran **et** écrit `DIAGNOSTIC.txt` à côté de `DEMARRER.bat`.
`DEMARRER.bat` écrit lui aussi `DEMARRAGE-LOG.txt` avec un marqueur
`[MARKER]` qui indique si le script PowerShell a réellement démarré.

**Si PowerShell est bloqué par une stratégie d'entreprise** : le lanceur bascule
automatiquement sur Node.js, puis Python, puis le **mode dossier** (Chrome/Edge,
zéro installation). Installez simplement Node.js depuis nodejs.org pour retrouver
la synchronisation instantanée.

### 3.4 Sortie CŒUR — `outputs/coeur.html`

Écran de louange dédié : la **section courante** s'affiche en très gros
caractères au centre, et la **section suivante** est annoncée en bas de l'écran
(libellé « À SUIVRE · Refrain » + premières lignes). La section suivante est
calculée automatiquement : prochaine *section différente*, sinon écran suivant.

Bouton **« ♥ Cœur seul »** dans l'onglet Chants : envoie uniquement cette sortie,
sans toucher au plein écran ni au bas centré. Le bouton « Envoyer les 3 » envoie
les trois ensemble.

La sortie Cœur est **collante** : elle conserve le chant affiché même si la Bible
ou un média prend le plein écran — l'équipe de louange garde toujours son
repère. Ajoutez `?sticky=0` à l'URL pour qu'elle suive au contraire l'outil en
cours. Les aperçus TRAVAIL et À L'ANTENNE du Cœur sont intégrés au panneau
latéral de la régie.

### 3.5 Lowerthirds / contenus personnalisés — `4`

**Quatrième outil / calque indépendant.** Les affichages bas centrés peuvent rester
pendant que Bible, Chants et Médias se cèdent mutuellement la place en plein écran.

Créez des lowerthirds éditables : toutes les mises en forme, image de fond, texte
par-dessus, **durée d'affichage intégrée** (en secondes), **type de transition**
précisé (fade, slide, zoom, move…) comme dans PowerPoint mais en lowerthird.
Enregistrer, modifier, supprimer, renommer. Cible réglable : `bas` par défaut,
`plein`, ou `les deux`. Le contenu part en 8K même si l'écran final est 1080p.

La durée est convertie de secondes en millisecondes dans `core/output-config.js`,
avec `lowerthirdRemainingMs()` pour le compte à rebours et une extinction
automatique qui anticipe la transition de sortie.

---

## 4. Designs — un seul moteur, aucun décalage

Onglet `Designs` (`5`). Chaque outil a son propre design plein et son propre design
bas, soit **8 designs indépendants** (`bible:plein`, `bible:bas`, `chants:plein`, …).

- **Calques** : fond, cadre, calque de couleur, zones de texte (`reference`,
  `content`, `version`, `label`…). Chaque zone se positionne et se redimensionne
  **indépendamment**.
- **Le fond ne bouge pas** : seul le texte change quand on envoie un nouveau
  contenu. Les nœuds DOM du fond sont réutilisés, pas recréés.
- **Tous les fonds vides sont transparents** pour laisser passer une caméra.
- **Ajustement automatique** : `core/measure.js` mesure réellement le texte et réduit
  la police jusqu'à ce qu'elle tienne. Les zones ont une taille maximale :
  **jamais de débordement dans OBS**.
- Boutons pour positionner, agrandir/réduire, changer la police, la couleur,
  l'alignement, l'ombre, l'espacement.
- **Copier depuis le plein écran** : une sortie personnalisée hérite du design
  plein écran jusqu'à ce que vous le modifiiez.

Cas d'usage réel : créez un visuel rectangulaire à coins carrés dans Photoshop,
exportez-le en PNG, importez-le comme fond dans l'éditeur, ajustez la zone de texte,
la taille et la police — le rendu OBS sera identique et ne débordera jamais.

**Déterminisme prouvé par test** : deux instances du moteur `Stage` produisent un
DOM identique ; un design modifié donne le même résultat des deux côtés ; changer le
zoom ne modifie que `stage.scale` ; le fond reste identique quand le texte change.

---

## 5. Vues spéciales

### Vue orateur — `outputs/orateur.html`

Reçoit tout ce qui passe en plein écran. La régie pasteur peut envoyer des messages
avec une transition de type *move*. Un message reste affiché **15 secondes** sauf si
la régie coupe. Pendant un message, un coin en bas affiche le contenu qui passe en
plein écran ; dès qu'il n'y a plus de message, l'écran reprend totalement la sortie
plein écran des outils.

### Vue minuteur / trame d'événement — `regies/minuteur.html`

Régie **séparée**, gérée par une autre personne. On enregistre la trame, chaque
chose prévue, avec le temps attribué. Au lancement : preview pour la régie, et la
sortie minuteur devient **totalement noire avec le décompte**. Si la régie temps n'a
pas cliqué **« suivant »** à la fin, le temps **continue en négatif** pour montrer le
dépassement (`−00:15`). Boutons live : **+ / − 30 s, 1 min, 5 min, 10 min, 30 min, 1 h**.
Quand rien n'est affiché, la sortie minuteur montre seulement des pointillés qui
clignotent.

Les helpers `remainingMs()`, `fmt()`, `fmtDuration()` sont dans `core/timer.js` —
purs, sans effet DOM, donc testables et identiques partout.

---

## 6. Sauvegarde

**Tout** est sauvegardé automatiquement à chaque entrée : Bible, chants,
lowerthirds, médias, projets, état, designs, présence des sorties.

Deux niveaux :
1. **Navigateur** — IndexedDB immédiat (anti-coupure).
2. **Dossier du projet** — `donnees/…` via le serveur, ou directement en mode dossier.

| Dossier | Contenu |
|---|---|
| `donnees/bibles/` | Versions de Bible (`ls1910.json`, `kjv.json`, vos imports) |
| `donnees/chants/` | Chants |
| `donnees/lowerthirds/` | Lowerthirds et contenus personnalisés |
| `donnees/medias/` | Médias copiés / importés |
| `donnees/projets/` | Projets et trames d'événement |
| `donnees/designs/` | Designs par outil |
| `donnees/polices/` | Polices locales |
| `donnees/etat/` | `state.json`, `live.js` (pont pour OBS sans serveur) |

Recherche, modification, renommage, suppression et duplication existent pour chaque
outil. Bible et chants proposent des suggestions dès les premières lettres.

---

## 7. Raccourcis clavier et souris

| Touche | Action |
|---|---|
| `1`…`9` | Changer d'outil / de vue |
| `Entrée` | Valider la saisie (Bible : livre → chapitre → verset) |
| `Espace` | Bible : passer du chapitre au verset |
| `←` `→` | Verset ou section précédent / suivant |
| `F` | Envoyer en plein écran |
| `S` | Envoyer en bas centré |
| `N` | Noir / rétablir |
| `Ctrl+Z` | Annuler (pile d'historique de la régie) |
| `Ctrl+F` | Recherche |
| Clic droit | Menu contextuel sur les éléments |
| Clic sur un tag d'aperçu | **Loupe 1:1** : ouvre la vraie page de sortie en grand |

L'interface contourne autant que possible les réflexes navigateur : les clics
droite sont interceptés sur les listes et les aperçus, les touches de fonction
ne sont pas laissées au navigateur.

---

## 8. Fiabilité en conditions réelles

Deux pièges classiques d'OBS ont été traités et vérifiés dans un vrai Chromium :

1. **Source navigateur masquée → animations figées.** Le timeline Web Animations
   peut rester à `currentTime: 0` (`playState: running`) quand la source n'est pas
   visible. Avec `fill: both`, le texte restait à **opacité 0**, donc invisible à
   l'antenne. `core/renderer.js` considère désormais l'animation comme un **bonus** :
   un filet de sécurité annule l'animation après sa durée et repasse l'opacité
   inline à `1`. Le texte s'affiche quoi qu'il arrive.
2. **Aperçus de travail vides.** Le sélecteur cherchait un `.stage-host` enfant
   alors que l'élément porte lui-même la classe. Corrigé ; les aperçus TRAVAIL
   utilisent le même `Stage` que les sorties.

Le parcours complet a été joué dans Chromium : régie → clic « Les deux » →
`outputs/plein.html` **et** `outputs/bas.html` affichent le bon texte, **0 erreur
console**.

---

## 9. Tests

```bash
npm install                 # outils de test — le livrable n'en a PAS besoin
npm test                    # TOUTES les suites (161 tests)
node --test tests/unit.test.mjs
node --test tests/render.test.mjs
node --test tests/http.test.mjs
node --test tests/python.test.mjs
node --test tests/powershell.test.mjs
node --test tests/ui.test.mjs
node --test tests/browser.test.mjs
```

| Suite | Résultat | Ce qu'elle prouve |
|---|---|---|
| `unit.test.mjs` | **66/66** | Références bibliques, Esther 8:9 en 4 sections, minuteur négatif, médias/YouTube, `?tool=`, durée lowerthird, **sortie Cœur**, vignettage média, RTF navigateur |
| `render.test.mjs` | **18/18** | Déterminisme preview/OBS, fond inchangé, transparence, HTML assaini, auto-ajustement, vidéo réutilisée, `page=1 → page=4`, YouTube, **vignette image/vidéo** |
| `http.test.mjs` | **27/27** | Santé, pages, MIME, **sécurité des dossiers**, état, SSE, CRUD, upload, Range, copie, **duplication réelle**, renommage, conversion, présence, 404 |
| `python.test.mjs` | **10/10** | Le serveur de repli Python : mêmes pages, patch, SSE, Range, CRUD, upload, duplication, sécurité |
| `powershell.test.mjs` | **19/19** | Syntaxe PowerShell analysée par la grammaire WASM de VS Code, routes, sécurité, lanceurs `.bat`/`.sh`/`.command` |
| `ui.test.mjs` | **9/9** | Montage réel des 9 modules jsdom : suggestions `es`, 4 sections, envoi, flèches, sous-onglets, 2 clics médias, lowerthird, designs, liens, orateur, raccourcis |
| `browser.test.mjs` | **12/12** | **Vrai Chromium** : 0 erreur console, régie → plein + bas, plein figé pendant les 4 sections, **sortie Cœur collante**, **vignette média**, opacité OBS, transparence, liens |

**Total : 161 tests, 0 échec.**

**Isolation des tests** : les serveurs de test reçoivent `FREESTREAM_DATA_DIR`
qui pointe vers un dossier temporaire. Les démos du projet y sont copiées, mais
**aucune écriture de test ne touche le projet livré** (le piège classique était
un `lowerthird` de test dont la date changeait à chaque `npm test`).

**Sécurité serveur vérifiée** sur les trois moteurs : un `folder` non déclaré
(`../../etc`) renvoie `400 Dossier inconnu` ; un nom `../../../hack.txt` est
neutralisé en `hack.txt` dans le dossier autorisé ; aucune écriture n'est
possible à la racine du projet.

### Vérification navigateur / OBS (protocole manuel)

Un test Chromium headless automatisé a validé le rendu. Avant un culte, faites ce
contrôle de 3 minutes sur la machine de diffusion :

1. `DEMARRER.bat` → les deux pages s'ouvrent sans erreur.
2. OBS : créer une source navigateur `plein.html` **1920 × 1080**, cocher
   « Fonds transparents ». Créer une deuxième source `bas.html` par-dessus.
3. Régie → Bible → `es` → `Entrée` → `8` → `Espace` → `9` → `Entrée` → **Les deux**.
4. Constater : plein écran = verset complet ; bas centré = section 1/4.
5. Appuyer 3× sur `→` : le bas centré défile 2/4, 3/4, 4/4 ; **le plein écran ne
   bouge pas**. Une 4ª fois : les deux passent au verset suivant.
6. Chants : saisir en minuscules → l'antenne affiche en GRANDS CARACTÈRES.
7. Médias : 1er clic = aperçu seul, 2ᵉ clic = OBS change. Importer une image
   portrait : l'écran doit être **entièrement rempli** par la vignette floutée,
   sans bande noire, l'image restant nette et non recadrée au centre.
8. Cœur : ouvrir `outputs/coeur.html`, envoyer un chant → section courante en
   gros + « À SUIVRE · Refrain » en bas. Envoyer une Bible : le Cœur **reste**.
9. `⛶ Max` (F11) : la régie occupe tout l'écran, `◧ Aperçus` replie le
   panneau de droite. Designs → « Remplissage maximal » : la police grandit,
   l'aperçu et OBS restent identiques.
8. Lowerthird : durée 2 s → il disparaît tout seul.
9. Orateur : message → 15 s puis retour plein écran.
10. Minuteur : démarrer → noir + décompte → laisser dépasser → `−00:xx`.
11. Couper le serveur puis recharger une sortie OBS : elle relit `live.js` et garde
    le dernier état (pont sans serveur).

---

## 10. Importer / convertir (hors ligne)

```bash
node outils/convertir.mjs bible ma-bible.csv --version "Segond 21"
node outils/convertir.mjs bible ma-bible.xml          # OSIS, Zefania, USFX
node outils/convertir.mjs bible ma-bible.json
node outils/convertir.mjs chants mes-chants.txt
node outils/convertir.mjs diapos message.pptx --dpi 150
node outils/convertir.mjs analyser fichier-inconnu.csv
```

Aucune dépendance npm, aucun réseau. Les API en ligne gratuites peuvent être
ajoutées pour enrichir les catalogues, mais restent **optionnelles**.

---

## 11. Fabriquer le dossier livrable

**Le dossier est déjà prêt dans ce dépôt : `dist/FREESTREAM/`.** Copiez-le
directement à la racine de `C:\`. Pour le régénérer après modification :

```bash
node outils/exporter.mjs                       # → dist/FREESTREAM
node outils/exporter.mjs --dest C:\FREESTREAM --force
node outils/exporter.mjs --zip                 # archive .zip en plus
```

L'export exclut `node_modules`, `.git`, les tests, les caches et l'état en cours,
vérifie la présence de tous les fichiers critiques **et** que tous les liens
`src`/`href` des pages pointent vers un fichier existant. Il dépose un `state.json`
vierge et un `live.js` valide. Taille : ~1,4 Mo avec les captures, ~0,4 Mo sans.

### Captures de vérification

Les images `docs/captures/` ont été prises dans un **vrai Chromium** pendant les
tests, sur le dossier livrable lui-même :

| Fichier | Ce qu'il montre |
|---|---|
| `01-regie.png` | Régie complète, 9 outils, suggestions, 4 sections Esther 8:9, **6 aperçus** (plein, bas, Cœur × travail/antenne) |
| `02-sortie-plein.png` | Sortie OBS plein écran 1920×1080, texte blanc net (correctif d'opacité) |
| `03-sortie-coeur.png` | **Sortie Cœur** : section courante en gros + « À SUIVRE · Refrain » en bas |
| `04-liens-obs.png` | Page des liens OBS prête à copier, avec la section Cœur |
| `05-vignette-media.png` | Image portrait non-16:9 : **vignette floutée colorée** qui remplit tout l'écran, média net au centre |

---

## 12. Architecture

```
FREESTREAM/
├── DEMARRER.bat / DEMARRER.sh     lanceurs
├── server.js                     serveur HTTP zéro dépendance (SSE, état, Range, CRUD)
├── server.py                     serveur de repli Python standard
├── index.html                    page des liens OBS
├── regie.html + regie/           régie principale (9 modules ES)
├── regies/minuteur.html          régie temps, séparée
├── outputs/                      pages OBS (plein, bas, custom, orateur, minuteur)
├── core/                         moteur partagé (renderer, store, measure, timer,
│                                 bible-utils, songs-utils, media, output-config…)
├── styles/                       CSS
├── donnees/                      toutes les données, un dossier par chose
├── templates/                    modèles de départ
├── outils/                       convertir.mjs, exporter.mjs
└── tests/                        suites Node + jsdom
```

**Flux** : la régie écrit un patch → `server.js` fusionne en profondeur, incrémente
`rev`, persiste `donnees/etat/state.json` + `live.js`, et diffuse en **SSE** à toutes
les sorties. Celles-ci appliquent l'état via le même `Stage` que les aperçus. Si le
serveur tombe, `core/store.js` bascule sur `BroadcastChannel` puis sur la relecture
de `live.js` : **l'antenne ne devient jamais noire à cause d'un redémarrage**.

---

## 13. Dépannage

| Symptôme | Cause / solution |
|---|---|
| Page blanche dans OBS | Vérifier l'URL et que la fenêtre serveur est ouverte. Recharger la source. |
| Le texte est gris / invisible | Version ancienne : relancez l'export. Le correctif d'opacité est dans `core/renderer.js`. |
| Rien ne se synchronise | Ouvrir `http://localhost:8787/api/health` : doit répondre `{"ok":true}`. |
| Un PPTX ne se contrôle pas page par page | Exportez-le en PDF ou lancez `convertir.mjs diapos`. |
| Caméra invisible derrière | Cocher « Fonds transparents » dans la source navigateur OBS. |
| Police différente en OBS | Déposez la police dans `donnees/polices/` et sélectionnez-la dans Designs. |
| Ancienne version : `npm test` ne terminait pas | Mettez à jour : les handles jsdom sont nettoyés, `--test-force-exit` n'est plus nécessaire (il tronquait des tests). |
| Serveur occupé | `node server.js 8788` puis utilisez le port 8788 dans les URLs. |

---

## 14. Licence et philosophie

Projet local, gratuit, sans télémétrie. Tout reste sur votre machine. Aucun CDN,
aucun compte, aucune dépendance externe obligatoire. Conçu pour qu'une équipe de
louange puisse régier un culte entier avec un portable, OBS et un dossier copié
sur `C:\`.
