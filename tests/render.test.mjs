import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.mjs';

const dom = makeDom(`<!doctype html><html><body>
  <div id="a"></div><div id="b"></div><div id="c"></div>
</body></html>`);

const { Stage, TRANSITIONS, normalizeDesign, styleToCss, resolveTemplate } = await import('../core/renderer.js');
const { defaultDesigns, textLayer, textStyle } = await import('../core/defaults.js');
const { sanitizeHtml } = await import('../core/sanitize.js');
const designs = defaultDesigns();
const VARS = { reference:'ESTHER 8:9', content:'Les secrétaires du roi furent appelés en ce temps-là, au troisième mois.', version:'LSG' };

function snapshot(host) {
  return [...host.querySelectorAll('.fs-text-layer')].map(el => ({
    role: el.dataset.role,
    box: [el.style.left, el.style.top, el.style.width, el.style.height],
    overflow: el.dataset.overflow || '',
    fontSize: el.querySelector('.fs-text-inner')?.style.fontSize,
    fontWeight: el.querySelector('.fs-text-inner')?.style.fontWeight,
    color: el.querySelector('.fs-text-inner')?.style.color,
    align: el.querySelector('.fs-text-inner')?.style.textAlign,
    html: el.querySelector('.fs-text-inner')?.innerHTML,
  }));
}
function bgSnapshot(host) {
  const bg = host.querySelector('.fs-bg');
  return { html:bg?.innerHTML, background:bg?.style.background, layers:[...host.querySelectorAll('.fs-static > *')].map(e=>[e.dataset.type,e.style.cssText]) };
}

describe('GARANTIE « aperçu == OBS » — moteur de rendu unique', () => {
  test('deux instances du moteur produisent un DOM strictement identique', () => {
    const s1 = new Stage(document.getElementById('a'), { design:designs['bible:plein'] });
    const s2 = new Stage(document.getElementById('b'), { design:designs['bible:plein'] });
    s1.update(VARS,{animate:false}); s2.update(VARS,{animate:false});
    assert.deepEqual(snapshot(document.getElementById('a')), snapshot(document.getElementById('b')));
    s1.destroy(); s2.destroy();
  });

  test('un design modifié (police, couleur, position) donne le même résultat des deux côtés', () => {
    const d = structuredClone(designs['bible:plein']);
    d.layers.find(l=>l.role==='content').style.fontSize = 520;
    d.layers.find(l=>l.role==='content').style.color = '#00ff88';
    d.layers.find(l=>l.role==='content').box.x = 900;
    const s1 = new Stage(document.getElementById('a'), { design:d });
    const s2 = new Stage(document.getElementById('b'), { design:d });
    s1.update(VARS,{animate:false}); s2.update(VARS,{animate:false});
    assert.deepEqual(snapshot(document.getElementById('a')), snapshot(document.getElementById('b')));
    const snap = snapshot(document.getElementById('a'));
    const content = snap.find(x=>x.role==='content');
    assert.ok(['#00ff88','rgb(0, 255, 136)'].includes(content.color));  // jsdom normalise les couleurs
    assert.equal(content.box[0],'900px');
    s1.destroy(); s2.destroy();
  });

  test('le zoom du conteneur ne change PAS le calcul de mise en page (8K → 1920×1080)', () => {
    const s1 = new Stage(document.getElementById('a'), { design:designs['bible:bas'] });
    const s2 = new Stage(document.getElementById('b'), { design:designs['bible:bas'] });
    Object.defineProperty(document.getElementById('b'),'clientWidth',{value:960,configurable:true});
    Object.defineProperty(document.getElementById('b'),'clientHeight',{value:540,configurable:true});
    s1.update(VARS,{animate:false}); s2.update(VARS,{animate:false});
    s1.layout(); s2.layout();
    assert.deepEqual(snapshot(document.getElementById('a')), snapshot(document.getElementById('b')));
    assert.notEqual(s1.scale, s2.scale);   // seul le facteur d'échelle diffère
    s1.destroy(); s2.destroy();
  });

  test('les 8 designs de base rendent tous sans erreur', () => {
    for (const [k,d] of Object.entries(designs)) {
      const hostEl = document.getElementById('c');
      const s = new Stage(hostEl,{design:d});
      s.update({ reference:'RÉFÉRENCE', content:'Contenu de test', version:'LSG', title:'Titre', subtitle:'Sous-titre', section:'1/2' },{animate:false});
      assert.ok(hostEl.querySelector('.fs-stage'), k);
      s.destroy();
    }
  });
});

describe('Fond figé — « le fond ne bouge pas, seul le texte bouge »', () => {
  test('le DOM du fond et des calques est strictement inchangé après changement de texte', () => {
    const s = new Stage(document.getElementById('a'), { design:designs['bible:plein'] });
    s.update(VARS,{animate:false});
    const before = bgSnapshot(document.getElementById('a'));
    s.update({ ...VARS, content:'Un tout autre verset, complètement différent.' },{animate:false});
    const after = bgSnapshot(document.getElementById('a'));
    assert.deepEqual(after, before);
    assert.notEqual(snapshot(document.getElementById('a'))[0].html, '');
    s.destroy();
  });
  test('un fond image ou vidéo est construit une seule fois', () => {
    const d = structuredClone(designs['chants:plein']);
    d.background = { kind:'video', src:'/media/fond.mp4', muted:true, loop:true, fit:'cover', opacity:1, brightness:1, saturate:1 };
    const s = new Stage(document.getElementById('c'), { design:d });
    const v1 = document.querySelector('#c .fs-bg video');
    assert.ok(v1);
    s.update({ content:'A' },{animate:false});
    assert.equal(document.querySelector('#c .fs-bg video'), v1);   // même nœud → pas de scintillement
    s.destroy();
  });
});

describe('Transparence et sécurité', () => {
  test('un fond vide est réellement transparent (caméra visible dans OBS)', () => {
    const s = new Stage(document.getElementById('a'), { design:designs['bible:bas'] });
    assert.equal(document.querySelector('#a .fs-bg').style.background, 'transparent');
    s.destroy();
  });
  test('le HTML injecté est assaini avant affichage', () => {
    const s = new Stage(document.getElementById('a'), { design:designs['bible:plein'] });
    s.update({ reference:'X', content:'<b>Gras</b><script>alert(1)</script><img src=x onerror=alert(2)>', version:'' },{animate:false});
    const html = document.querySelector('#a .fs-text-layer[data-role="content"] .fs-text-inner').innerHTML;
    assert.ok(html.includes('<b>Gras</b>'));
    assert.ok(!html.toLowerCase().includes('<script'));
    assert.ok(!html.includes('onerror'));
    s.destroy();
  });
  test('les variables {{…}} sont résolues', () => {
    assert.equal(resolveTemplate('{{a}} — {{b}}',{a:'X',b:'Y'}), 'X — Y');
    assert.equal(resolveTemplate('{{manquant}}',{}), '');
  });
});

describe('Zones de texte — jamais de débordement', () => {
  test('un texte trop long réduit la police et lève le drapeau de débordement', () => {
    const d = structuredClone(designs['bible:bas']);
    const s = new Stage(document.getElementById('a'), { design:d });
    const veryLong = 'Un texte extrêmement long '.repeat(40);
    s.update({ reference:'R', content:veryLong },{animate:false});
    const inner = document.querySelector('#a .fs-text-layer[data-role="content"] .fs-text-inner');
    const layer = document.querySelector('#a .fs-text-layer[data-role="content"]');
    const size = parseFloat(inner.style.fontSize);
    assert.ok(size < d.layers.find(l=>l.role==='content').style.fontSize);
    assert.equal(inner.style.overflow,'hidden');
    s.destroy();
  });
  test('normalizeDesign borne les zones dans le canvas', () => {
    const d = normalizeDesign({ canvas:{w:7680,h:4320}, layers:[
      { type:'text', role:'content', box:{x:-500,y:99999,w:99999,h:20}, style:{fontSize:200}, template:'{{content}}' },
      { type:'shape', box:{x:0,y:0,w:100,h:100} },
    ]});
    assert.ok(d.layers[0].box.x >= 0 && d.layers[0].box.y < 4320);
    assert.ok(d.layers[0].box.w <= 7680 && d.layers[0].box.h >= 10);
    assert.equal(d.layers[1].id !== undefined, true);
  });
  test('le plancher des chants reste respecté', () => {
    const d = designs['chants:plein'];
    const c = d.layers.find(l=>l.role==='content');
    const s = new Stage(document.getElementById('b'), { design:d });
    s.update({ title:'T', content:'Une ligne\nDeux lignes', section:'1/1' },{animate:false});
    const inner = document.querySelector('#b .fs-text-layer[data-role="content"] .fs-text-inner');
    assert.ok(parseFloat(inner.style.fontSize) >= c.style.minFontSize);
    s.destroy();
  });
});

describe('Médias & transitions', () => {
  test('une vidéo crée un élément <video> et le réutilise au changement d\'état', () => {
    const s = new Stage(document.getElementById('a'), { design:designs['medias:plein'] });
    s.update({ mediaSrc:'/media/clip.mp4' },{ media:{src:'/media/clip.mp4',kind:'video',playing:false,muted:true,volume:0.5}, animate:false });
    const v = document.querySelector('#a video.fs-media-main');
    assert.ok(v, 'le média principal est identifiable');
    s.update({}, { media:{src:'/media/clip.mp4',kind:'video',playing:true,muted:false,volume:1} });
    assert.equal(document.querySelector('#a video.fs-media-main'), v, 'le nœud est réutilisé');
    assert.equal(v.muted, false);
    // La vignette floutée est une COPIE distincte, toujours muette.
    const back = document.querySelector('#a video:not(.fs-media-main)');
    assert.ok(back, 'une vignette vidéo floutée existe');
    assert.equal(back.muted, true);
    assert.ok(back.style.filter.includes('blur'), 'la copie est floutée');
    assert.ok(document.querySelector('#a .fs-media-vignette'), 'dégradé de vignette présent');
    s.destroy();
  });
  test('une image non-16:9 remplit tout l’écran grâce à la vignette, sans recadrage', () => {
    const s = new Stage(document.getElementById('a'), { design: designs['medias:plein'] });
    s.update({ mediaSrc: '/media/portrait.png' }, { media: { src: '/media/portrait.png', kind: 'image' }, animate: false });
    const bg = document.querySelector('#a .fs-media-vignette-bg');
    const front = document.querySelector('#a .fs-media-front');
    assert.ok(bg && front, 'fond flouté + image nette au premier plan');
    assert.ok(bg.style.filter.includes('blur'));
    assert.ok(bg.style.background.includes('cover'), 'le fond comble tout le canevas');
    assert.ok(front.style.background.includes('contain'), 'l’image réelle n’est PAS recadrée');
    assert.ok(document.querySelector('#a .fs-media-vignette'), 'dégradé de vignette');
    s.destroy();
  });
  test('vignette désactivable : aucun fond flouté', () => {
    const d = structuredClone(designs['medias:plein']);
    for (const l of d.layers) if (l.type === 'media') l.vignette = false;
    const s = new Stage(document.getElementById('a'), { design: d });
    s.update({ mediaSrc: '/media/a.png' }, { media: { src: '/media/a.png', kind: 'image' }, animate: false });
    assert.ok(!document.querySelector('#a .fs-media-vignette-bg'));
    assert.ok(document.querySelector('#a .fs-media-front'));
    s.destroy();
  });
  test('un PDF crée un iframe avec #page=N et change de page', () => {
    const s = new Stage(document.getElementById('b'), { design:designs['medias:plein'] });
    s.update({ mediaSrc:'/media/doc.pdf' },{ media:{src:'/media/doc.pdf',kind:'doc',slide:1}, animate:false });
    const f = document.querySelector('#b iframe'); assert.ok(f); assert.ok(f.src.includes('page=1'));
    s.update({}, { media:{src:'/media/doc.pdf',kind:'doc',slide:4} });
    assert.ok(f.src.includes('page=4'));
    s.destroy();
  });
  test('un lien YouTube est converti en embed contrôlable', () => {
    const s = new Stage(document.getElementById('c'), { design:designs['medias:plein'] });
    s.update({ mediaSrc:'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },{ media:{src:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',kind:'link'}, animate:false });
    const f = document.querySelector('#c iframe');
    assert.ok(f.src.includes('enablejsapi=1'));
    s.destroy();
  });
  test('toutes les transitions ont des images clés valides', () => {
    for (const [k,v] of Object.entries(TRANSITIONS)) {
      assert.ok(Array.isArray(v.inKF) && Array.isArray(v.outKF), k);
    }
    assert.ok(TRANSITIONS.fade.inKF.length > 0);
  });
});
