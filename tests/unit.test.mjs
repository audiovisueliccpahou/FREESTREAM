import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeDom } from './setup.mjs';

const dom = makeDom();
const { parseReference, searchBooks, BOOKS, stepVerse, searchVerses, formatRef, verseCountFromDataset } = await import('../core/bible-utils.js');
const { splitText, partsForLength, fitFontSize, wrapText, measureLine } = await import('../core/measure.js');
const { parseSong, serializeSong, allSlides, chunkSection, searchSongs, importSong, exportSong, importMany, decodeRtf } = await import('../core/songs-utils.js');
const { sanitizeHtml, toPlainText, splitPlain } = await import('../core/sanitize.js');
const { importBible, getVerse, getRange } = await import('../core/bible-data.js');
const { fmt } = await import('../core/timer.js');
const { normalizeMediaUrl, youtubeId } = await import('../core/media.js');
const { defaultState, defaultDesigns, defaultOutputs, mergeState, ensureDefaults } = await import('../core/defaults.js');
const { resolveOutputConfig, toolVisible, lowerthirdTargets, lowerthirdActive, lowerthirdRemainingMs } = await import('../core/output-config.js');

/* ------------------------------------------------------------ Bible : saisie */
describe('Bible — références et recherche', () => {
  test('« es 8 9 » doit pointer sur ESTHER (cas du cahier des charges)', () => {
    const p = parseReference('es 8 9');
    assert.equal(p.book.name, 'Esther');
    assert.equal(p.chapter, 8); assert.equal(p.verse, 9);
  });
  test('formats variés acceptés', () => {
    const cases = [
      ['Esther 8:9', 'Esther', 8, 9], ['jn3 16','Jean',3,16], ['1co 13 4','1 Corinthiens',13,4],
      ['ps 23:1','Psaumes',23,1], ['gen 1 1','Genèse',1,1], ['esa 53 5','Ésaïe',53,5],
      ['ap 21 4','Apocalypse',21,4], ['jean 3','Jean',3,1], ['es 8 9-11','Esther',8,9],
    ];
    for (const [q,b,c,v] of cases) { const p = parseReference(q); assert.equal(p.book.name,b,q); assert.equal(p.chapter,c,q); assert.equal(p.verse,v,q); }
    assert.equal(parseReference('es 8 9-11').toVerse, 11);
  });
  test('recherche de livres : 1–2 lettres, plus proche en premier', () => {
    assert.equal(searchBooks('es')[0].name, 'Esther');
    assert.equal(searchBooks('jn')[0].name, 'Jean');
    assert.equal(searchBooks('1co')[0].name, '1 Corinthiens');
    assert.equal(searchBooks('ap')[0].name, 'Apocalypse');
    assert.ok(searchBooks('e').length <= 12);
  });
  test('66 livres, navigation verset/chapitre', () => {
    assert.equal(BOOKS.length, 66);
    let r = { book:'Jean', chapter:3, verse:21 };
    r = stepVerse(r, 1, () => 21);
    assert.equal(r.chapter, 4); assert.equal(r.verse, 1);
    r = stepVerse(r, -1, c => c===3?21:1);
    assert.equal(r.chapter, 3); assert.equal(r.verse, 21);
  });
  test('recherche par mots-clés et paraphrase', () => {
    const ds = JSON.parse(fs.readFileSync('donnees/bibles/ls1910.json','utf8'));
    const a = searchVerses(ds, 'Dieu a tant aimé');
    assert.ok(a.length && a[0].book === 'Jean' && a[0].verse === 16);
    const b = searchVerses(ds, 'berger');
    assert.ok(b.some(x => x.book === 'Psaumes' && x.chapter === 23));
  });
});

/* ---------------------------------------------------- Bible : jeu de données */
describe('Bible — données et import multi-formats', () => {
  const ls = JSON.parse(fs.readFileSync('donnees/bibles/ls1910.json','utf8'));
  test('Esther 8:9 existe et est long (> 400 caractères)', () => {
    const t = getVerse(ls,'Esther',8,9);
    assert.ok(t && t.length > 400);
  });
  test('plage de versets', () => {
    const r = getRange(ls,'Psaumes',23,1,3);
    assert.equal(r.length,3); assert.equal(r[0].verse,1); assert.equal(r[2].verse,3);
  });
  test('import TXT « Livre c:v texte »', () => {
    const d = importBible('Jean 3:16 Car Dieu a tant aime le monde.\nJean 3:17 Dieu n a pas envoye son Fils.\n','b.txt');
    assert.equal(getVerse(d,'Jean',3,16),'Car Dieu a tant aime le monde.');
  });
  test('import CSV', () => {
    const d = importBible('livre;chapitre;verset;texte\nJean;3;16;Car Dieu a tant aime\nPsaumes;23;1;L Eternel est mon berger\n','b.csv');
    assert.equal(getVerse(d,'Jean',3,16),'Car Dieu a tant aime');
  });
  test('import USFM', () => {
    const d = importBible('\\id JHN\n\\c 3\n\\v 16 Car Dieu a tant aime le monde.\n','b.usfm');
    assert.equal(getVerse(d,'Jean',3,16),'Car Dieu a tant aime le monde.');
  });
  test('import JSON plat', () => {
    const d = importBible(JSON.stringify({ 'Jean 3:16':'Texte libre' }),'b.json');
    assert.equal(getVerse(d,'Jean',3,16),'Texte libre');
  });
});

/* ------------------------------------------------- Découpage des versets longs */
describe('Découpage des versets longs (mode bas centré)', () => {
  const t = JSON.parse(fs.readFileSync('donnees/bibles/ls1910.json','utf8')).books.Esther['8']['9'];
  test('Esther 8:9 → 4 sections avec le réglage par défaut (150)', () => {
    assert.equal(partsForLength(t,150), 4);
    assert.equal(splitText(t,4).length, 4);
  });
  test('les 4 sections couvrent tout le texte, sans mot coupé', () => {
    const parts = splitText(t,4);
    assert.ok(parts.every(p => p.length > 40));
    assert.ok(parts.join(' ').includes('Sivan'));
    assert.ok(parts.join(' ').includes('Éthiopie'));
    assert.ok(parts.every(p => !/^\s|\s$/.test(p)));
  });
  test('un verset court reste en 1 section', () => {
    assert.equal(partsForLength('Jésus pleura.',150), 1);
    assert.deepEqual(splitText('Jésus pleura.',1), ['Jésus pleura.']);
  });
  test('chaque section tient dans la zone bas-centré sans déborder', () => {
    const st = { fontSize:186, minFontSize:120, fontWeight:700, lineHeight:1.14, padding:24 };
    for (const p of splitText(t,4)) {
      const fit = fitFontSize(p,6360,600,st);
      assert.equal(typeof fit, 'number', 'ne doit pas signaler de débordement');
      assert.ok(fit <= st.fontSize && fit >= st.minFontSize);
    }
  });
  test('le verset entier tient dans la zone plein écran', () => {
    const fit = fitFontSize(t,6440,2380,{fontSize:300,minFontSize:150,fontWeight:700,lineHeight:1.16,padding:24});
    assert.equal(typeof fit,'number'); assert.ok(fit > 200);
  });
});

/* ------------------------------------------------------------- Ajustement */
describe('Moteur de mesure — jamais de débordement', () => {
  test('fitFontSize réduit la police et reste borné', () => {
    const text = 'Un très long texte '.repeat(30);
    const fit = fitFontSize(text, 1200, 300, { fontSize:400, minFontSize:30, fontWeight:700, lineHeight:1.2, padding:10 });
    assert.ok(typeof fit === 'object' ? fit.size >= 30 : fit >= 30);
  });
  test('wrapText ne produit pas de ligne plus large que la boîte', () => {
    const st = { fontSize:100, fontWeight:700 };
    const lines = wrapText('Le Seigneur est mon berger je ne manquerai de rien', 900, st);
    assert.ok(lines.length >= 2);
    assert.ok(lines.every(l => measureLine(l,st) <= 901));
  });
  test('mesure déterministe (même résultat 2 fois)', () => {
    const st = { fontSize:200, fontWeight:800 };
    assert.equal(measureLine('Alléluia',st), measureLine('Alléluia',st));
  });
});

/* ------------------------------------------------------------------- Chants */
describe('Chants — double retour = nouvelle partie', () => {
  test('un retour = même partie, deux retours = nouvelle partie', () => {
    const s = parseSong('Ligne A\nLigne B\n\nLigne C\nLigne D','Titre');
    assert.equal(s.sections.length, 2);
    assert.deepEqual(s.sections[0].lines, ['Ligne A','Ligne B']);
    assert.deepEqual(s.sections[1].lines, ['Ligne C','Ligne D']);
  });
  test('aller-retour texte → chant → texte conservé', () => {
    const raw = 'Couplet 1\nPremière ligne\nDeuxième ligne\n\nRefrain\nRefrain ligne';
    const s = parseSong(raw,'Mon chant');
    assert.equal(s.title,'Mon chant');
    assert.equal(s.sections[0].label,'Couplet 1');
    assert.equal(s.sections[1].label,'Refrain');
    assert.equal(serializeSong(s).split('\n\n').length,2);
  });
  test('découpage en écrans garde peu de lignes → garantit les gros caractères', () => {
    const s = parseSong(Array.from({length:10},(_,i)=>'Ligne '+(i+1)).join('\n'),'T');
    const slides = allSlides(s,4);
    assert.equal(slides.length,3);           // 4 + 4 + 2
    assert.ok(slides.every(x => x.text.split('\n').length <= 4));
  });
  test('recherche par contenu (quelques mots d\'une parole)', () => {
    const a = parseSong('Ainsi soit-il Seigneur\nQue ta volonte soit faite','Chant A');
    const b = parseSong('Tu es digne et saint','Chant B');
    assert.equal(searchSongs([a,b],'volonte soit faite')[0].title,'Chant A');
    assert.equal(searchSongs([a,b],'digne')[0].title,'Chant B');
  });
  test('import ChordPro : les accords ne polluent pas les paroles', () => {
    const s = importSong('{title: Mon chant}\n[C]Amazing [G]grace\n\n{comment: Refrain}\n[F]How sweet','c.cho');
    assert.equal(s.title,'Mon chant');
    assert.equal(s.sections[0].lines[0],'Amazing grace');
  });
  test('import FreeShow JSON', () => {
    const s = importSong(JSON.stringify({title:'FS',slides:[{group:'Couplet',items:[{type:'text',lines:['L1','L2']}]}]}),'f.json');
    assert.equal(s.title,'FS'); assert.deepEqual(s.sections[0].lines,['L1','L2']);
  });
  test('import plusieurs chants séparés par ===', () => {
    const arr = importMany('Chant un\nLigne\n\n===\n\nChant deux\nLigne','multi.txt');
    assert.equal(arr.length,2);
  });
  test('export JSON relisible', () => {
    const s = parseSong('A\n\nB','T'); const out = exportSong(s,'json');
    assert.equal(JSON.parse(out).sections.length,2);
  });
});

/* --------------------------------------------------------------- Sécurité */
describe('HTML enrichi — toutes les mises en forme, aucun script', () => {
  test('script/style retirés, formatage conservé', () => {
    const h = sanitizeHtml('<b>Gras</b> <i>italique</i> <span style="color:#ff0000">rouge</span><script>alert(1)</script><img src=x onerror=alert(2)>');
    assert.ok(h.includes('<b>Gras</b>'));
    assert.ok(h.includes('<i>italique</i>'));
    assert.ok(h.includes('color:#ff0000'));
    assert.ok(!h.toLowerCase().includes('<script'));
    assert.ok(!h.includes('onerror'));
    assert.ok(!h.includes('<img'));
  });
  test('javascript: et url() retirés des styles', () => {
    const h = sanitizeHtml('<span style="color:red;background-image:url(javascript:alert(1))">x</span>');
    assert.ok(!h.toLowerCase().includes('javascript:'));
    assert.ok(h.includes('color:red'));
  });
  test('toPlainText extrait le texte', () => {
    assert.equal(toPlainText('<b>Jean</b> 3:16'), 'Jean 3:16');
  });
  test('splitPlain répartit équitablement', () => {
    assert.equal(splitPlain('un deux trois quatre cinq six sept huit',4).length,4);
  });
});

/* --------------------------------------------------------------- Minuteur */
describe('Minuteur — décompte et dépassement négatif', () => {
  test('format MM:SS', () => { assert.equal(fmt(65000),'01:05'); assert.equal(fmt(0),'00:00'); });
  test('format HH:MM:SS', () => { assert.equal(fmt(3600000+65000),'01:01:05'); });
  test('dépassement négatif', () => { assert.equal(fmt(-15000),'−00:15'); });
});

/* ----------------------------------------------------------------- Médias */
describe('Médias — liens YouTube et normalisation', () => {
  test('YouTube watch → embed contrôlable', () => {
    const n = normalizeMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.ok(n.youtube); assert.ok(n.src.includes('enablejsapi=1'));
  });
  test('YouTube live', () => { assert.ok(youtubeId('https://www.youtube.com/live/abcdef12345')); });
  test('MP4 distant reconnu comme vidéo', () => {
    assert.equal(normalizeMediaUrl('https://exemple.fr/clip.mp4?x=1').kind,'video');
  });
  test('fichier local', () => { assert.equal(normalizeMediaUrl('/media/clip.mp4').kind,'video'); });
});

/* ------------------------------------------------------- Configuration des sorties */
describe('Sorties — liens universels et liens dédiés par outil', () => {
  test('le paramètre ?tool= est prioritaire sur data-tool (liens par outil)', () => {
    const c = resolveOutputConfig({ dataset:{ type:'plein', tool:'*' }, search:'?tool=bible' });
    assert.equal(c.tool,'bible'); assert.equal(c.type,'plein');
  });
  test('sans paramètre, on garde la valeur du body', () => {
    const c = resolveOutputConfig({ dataset:{ type:'bas', tool:'*' }, search:'' });
    assert.equal(c.type,'bas'); assert.equal(c.tool,'*');
  });
  test('?preview=1 détecté, ?id= pour les sorties personnalisées', () => {
    const c = resolveOutputConfig({ dataset:{ type:'custom', tool:'*', outId:'x' }, search:'?id=abc&preview=1' });
    assert.equal(c.outId,'abc'); assert.equal(c.preview,true);
  });
  test('un lien dédié ne s\'allume que pour son outil (cède la place aux autres)', () => {
    assert.equal(toolVisible('*',null),true);
    assert.equal(toolVisible('*','bible'),true);
    assert.equal(toolVisible('bible','bible'),true);
    assert.equal(toolVisible('bible','chants'),false);
    assert.equal(toolVisible('bible',null),false);
  });
  test('lowerthird : cible bas par défaut, plein si demandé', () => {
    assert.equal(lowerthirdTargets({target:'bas'},'bas'),true);
    assert.equal(lowerthirdTargets({target:'bas'},'plein'),false);
    assert.equal(lowerthirdTargets({target:'plein'},'plein'),true);
  });
  test('lowerthird : durée respectée, 0 = permanent, coupure immédiate', () => {
    const now = 100000;
    assert.equal(lowerthirdActive({ duration:8, startedAt:now-2000 },now),true);
    assert.equal(lowerthirdActive({ duration:8, startedAt:now-9000 },now),false);
    assert.equal(lowerthirdActive({ duration:0, startedAt:now-999999 },now),true);
    assert.equal(lowerthirdActive({ duration:8, startedAt:now, cut:true },now),false);
    assert.equal(lowerthirdActive(null,now),false);
  });
});

/* ------------------------------------------------------------------- État */
describe('État par défaut', () => {
  test('2 universelles + 1 Cœur + 8 liens d\'outils + 2 vues spéciales = 13', () => {
    const o = defaultOutputs();
    assert.equal(o.length,13);
    assert.equal(o.filter(x=>x.tool==='*' && ['plein','bas'].includes(x.type)).length,2);
    assert.equal(o.filter(x=>x.tool!=='*' && ['plein','bas'].includes(x.type)).length,8);
    assert.equal(o.filter(x=>x.type==='special').length,2);
    const coeur = o.find(x=>x.id==='coeur');
    assert.ok(coeur, 'la sortie Cœur existe');
    assert.equal(coeur.type,'coeur');
    assert.equal(coeur.tool,'chants');
    assert.equal(coeur.path,'/outputs/coeur.html');
  });
  test('9 designs de base (4 outils × 2 formats + Cœur)', () => {
    assert.equal(Object.keys(defaultDesigns()).length,9);
  });
  test('sortie Cœur : section courante en gros + section suivante en bas', () => {
    const d = defaultDesigns()['chants:coeur'];
    assert.ok(d, 'design chants:coeur présent');
    assert.equal(d.type,'coeur');
    assert.deepEqual(d.canvas,{w:7680,h:4320});
    const cur = d.layers.find(l=>l.role==='content');
    const nxt = d.layers.find(l=>l.role==='next');
    assert.ok(cur && nxt, 'couches content et next présentes');
    assert.ok(cur.style.minFontSize >= 200, 'section courante en GRANDS CARACTÈRES');
    assert.ok(nxt.box.y > cur.box.y + cur.box.h - 400, 'la section suivante est bien EN BAS');
    assert.ok(d.layers.some(l=>l.role==='nextLabel' && /nextLabel/.test(l.template)), 'libellé « À suivre »');
    assert.ok(nxt.style.fontSize < cur.style.fontSize, 'la section suivante est plus discrète');
  });
  test('média : vignettage activé pour combler les formats non 16:9', () => {
    const m = defaultDesigns()['medias:plein'].layers.find(l=>l.type==='media');
    assert.equal(m.vignette,true);
    assert.ok(m.vignetteBlur >= 30);
    assert.equal(m.fit,'contain', 'le média réel reste intact (pas de recadrage)');
  });
  test('fond vide = transparent par défaut (caméra visible)', () => {
    const d = defaultDesigns();
    for (const k of ['bible:plein','bible:bas','lowerthird:bas','medias:bas'])
      assert.equal(d[k].background.kind,'transparent',k);
  });
  test('8K par défaut', () => { assert.deepEqual(defaultDesigns()['bible:plein'].canvas,{w:7680,h:4320}); });
  test('les chants ont un plancher de taille (grands caractères)', () => {
    const c = defaultDesigns()['chants:plein'].layers.find(l=>l.role==='content');
    assert.ok(c.style.minFontSize >= 200);
  });
  test('mergeState fusionne en profondeur sans écraser les tableaux', () => {
    const s = defaultState();
    mergeState(s, { bible:{ book:'Esther', chapter:8 }, outputs:[{id:'x'}] });
    assert.equal(s.bible.book,'Esther'); assert.equal(s.bible.chapter,8);
    assert.equal(s.bible.verse,16);             // valeur par défaut conservée
    assert.equal(s.outputs.length,1);           // tableau remplacé
  });
});

/* ------------------------------------------------- Import RTF 100 % navigateur */
describe('Chants — import RTF sans Buffer (compatible navigateur)', () => {
  test('décode les accents hexadécimaux RTF et les retours à la ligne', () => {
    const r = decodeRtf("{\\rtf1\\ansi Seigneur \\'e9ternel\\par Amen}");
    assert.ok(r.includes('éternel'), r);
    assert.ok(r.includes('\n'), 'les \\par deviennent des retours à la ligne');
    assert.ok(!r.includes('\\rtf'));
  });
  test('décode \\uNNNN (Unicode RTF)', () => {
    const r = decodeRtf("{\\rtf1 \\u233?ternel}");
    assert.ok(r.includes('éternel'), r);
  });
  test('ne touche pas au texte brut', () => {
    assert.equal(decodeRtf('simple chant'), 'simple chant');
  });
  test('aucune référence à Buffer dans le module', () => {
    const src = fs.readFileSync(new URL('../core/songs-utils.js', import.meta.url), 'utf8');
    assert.ok(!/\bBuffer\./.test(src), 'Buffer est indisponible dans un navigateur');
  });
  test('import ProPresenter avec RTFData fonctionne', () => {
    const xml = "<RVPresentationDocument name='Chant RTF'><RVSlideGroup name='Couplet'><RVTextElement RTFData='{\\rtf1 Berceau\\par Amen}'></RVTextElement></RVSlideGroup></RVPresentationDocument>";
    const s = importSong(xml, 'chant.pro6');
    assert.ok(s.sections.length > 0, JSON.stringify(s));
    const joined = s.sections[0].lines.join(' | ');
    assert.ok(joined.includes('Berceau') && joined.includes('Amen'), joined);
    assert.equal(s.title, 'Chant RTF');
  });
});

/* ------------------------------------- Lowerthird — durée en secondes → ms */
describe('Lowerthird — durée, cible et extinction', () => {
  const now = 1_700_000_000_000;
  test('actif pendant la durée (secondes converties en millisecondes)', () => {
    assert.equal(lowerthirdActive({ duration: 8, startedAt: now - 2000 }, now), true);
    assert.equal(lowerthirdActive({ duration: 8, startedAt: now - 9000 }, now), false);
  });
  test('durée 0 = affichage permanent, coupure immédiate', () => {
    assert.equal(lowerthirdActive({ duration: 0, startedAt: now - 999999 }, now), true);
    assert.equal(lowerthirdActive({ duration: 8, startedAt: now, cut: true }, now), false);
    assert.equal(lowerthirdRemainingMs({ duration: 8, startedAt: now, cut: true }, now), 0);
  });
  test('remainingMs décompte correctement et ne devient jamais négatif', () => {
    assert.equal(lowerthirdRemainingMs({ duration: 8, startedAt: now - 2000 }, now), 6000);
    assert.equal(lowerthirdRemainingMs({ duration: 8, startedAt: now - 20000 }, now), 0);
    assert.equal(lowerthirdRemainingMs({ duration: 0, startedAt: now }, now), Infinity);
  });
  test('cible bas par défaut, plein sur demande', () => {
    const lt = { text: 'Annonce' };
    assert.equal(lowerthirdTargets(lt, 'bas'), true);
    assert.equal(lowerthirdTargets(lt, 'plein'), false);
    assert.equal(lowerthirdTargets({ ...lt, target: 'plein' }, 'plein'), true);
  });
  test('?tool= est prioritaire sur data-tool', () => {
    const c = resolveOutputConfig({ dataset: { tool: '*', type: 'bas' }, search: '?tool=chants' });
    assert.equal(c.tool, 'chants');
    assert.equal(c.type, 'bas');
  });
  test('une sortie dédiée masque les autres outils', () => {
    assert.equal(toolVisible('bible', 'chants'), false);
    assert.equal(toolVisible('bible', 'bible'), true);
    assert.equal(toolVisible('*', 'medias'), true);
  });
});

/* ------------------------------- Migration d'un ancien état sauvegardé */
describe('Migration — une mise à jour ne fait jamais disparaître une sortie', () => {
  test('un ancien state sans sortie Cœur récupère la sortie et le design', () => {
    const old = defaultState();
    old.outputs = old.outputs.filter(o => o.id !== 'coeur');       // état d'avant la mise à jour
    delete old.designs['chants:coeur'];
    delete old.live.coeur;
    old.outputs.push({ id:'out-perso', name:'Mon écran', type:'custom', tool:'*', custom:true });
    ensureDefaults(old);
    assert.ok(old.outputs.find(o => o.id === 'coeur'), 'la nouvelle sortie Cœur est ajoutée');
    assert.ok(old.outputs.find(o => o.id === 'out-perso'), 'la sortie personnalisée est conservée');
    assert.ok(old.designs['chants:coeur'], 'le design Cœur est ajouté');
    assert.equal(old.live.coeur, null, 'le slot live.coeur est initialisé');
  });
  test('un serveur minimal avec outputs:[] ne vide pas les sorties du client', () => {
    const s = defaultState();
    mergeState(s, { outputs: [], designs: {} });      // ce que renvoyait un serveur de repli
    ensureDefaults(s);
    assert.equal(s.outputs.length, 13, 'les 13 sorties sont restaurées');
    assert.equal(Object.keys(s.designs).length, 9, 'les 9 designs sont restaurés');
  });
  test('les modifications utilisateur sur une sortie existante sont préservées', () => {
    const old = defaultState();
    old.outputs[0].name = 'MON NOM PERSONNALISÉ';
    ensureDefaults(old);
    assert.equal(old.outputs.find(o => o.id === 'plein').name, 'MON NOM PERSONNALISÉ');
  });
});
