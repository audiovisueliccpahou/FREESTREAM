/**
 * ÉDITEUR DE DESIGN — calques, zones de texte, fonds, transitions.
 * L'aperçu ci-dessous utilise EXACTEMENT le même moteur (core/renderer.js) que
 * les sorties OBS : il est donc impossible d'avoir un rendu différent en live.
 */
import { store, esc, $, $$, el, toast, setWork, pickFile, download, confirmDlg, formDlg } from './core.js';
import { Stage, TRANSITION_LABELS, TRANSITIONS } from '../core/renderer.js';
import { TOOLS, FONT_STACK, CANVAS_8K } from '../core/config.js';
import { defaultDesigns, textLayer, textStyle, uid } from '../core/defaults.js';

let host = null, key = 'bible:plein', stage = null, handles = null, selected = null, drag = null;
let ro = null, sampleVars = {};

const SAMPLE = {
  'bible:plein': { reference:'ESTHER 8:9', content:'Les secrétaires du roi furent appelés en ce temps-là, au troisième mois, qui est le mois de Sivan, le vingt-troisième jour.', version:'LSG' },
  'bible:bas': { reference:'ESTHER 8:9', content:'Les secrétaires du roi furent appelés en ce temps-là, au troisième mois.', version:'LSG' },
  'chants:plein': { title:'CHANT DE DÉMONSTRATION', content:'Ainsi soit-il, Seigneur\nQue ta volonté soit faite\nEn mon cœur, en ma maison', section:'Couplet · 1/2' },
  'chants:bas': { content:'Ainsi soit-il, Seigneur\nQue ta volonté soit faite' },
  'medias:plein': { title:'Vidéo', mediaSrc:'' },
  'medias:bas': { title:'Vidéo en cours' },
  'lowerthird:bas': { title:'Bienvenue à l\'église', subtitle:'Culte du dimanche · 10h00' },
  'lowerthird:plein': { title:'Bienvenue', subtitle:'Culte du dimanche' },
};

export async function mount(container) {
  host = container;
  host.innerHTML = `
    <div class="tool-head"><h1>🎨 Éditeur de design</h1><span class="pill acc">Ce que vous voyez ici = ce qu'OBS diffuse, au pixel près</span></div>
    <div class="row" style="margin-bottom:12px;flex-wrap:wrap">
      <select class="inp" id="d-key" style="width:auto;min-width:280px"></select>
      <button class="btn" id="d-copybas">⤵ Copier vers bas centré</button>
      <button class="btn" id="d-copyplein">⤴ Copier vers plein écran</button>
      <button class="btn" id="d-dup">⧉ Dupliquer</button>
      <button class="btn" id="d-reset">↺ Réinitialiser</button>
      <button class="btn" id="d-import">📥 Importer</button>
      <button class="btn" id="d-export">📤 Exporter</button>
      <label class="chk" style="margin-left:6px" title="Réduit les marges et agrandit automatiquement la police au maximum de la zone — identique en preview et dans OBS">
        <input type="checkbox" id="d-fill"> ⛶ Remplissage maximal</label>
      <button class="btn primary" id="d-save">💾 Appliquer partout</button>
    </div>
    <div class="grid2" style="grid-template-columns:1.25fr .75fr;align-items:start">
      <div>
        <div id="designer"><div class="stage-host" id="d-stage"></div><div id="d-handles" style="position:absolute;inset:0"></div></div>
        <div class="row" style="margin-top:9px">
          <span class="muted small">Glissez un calque pour le déplacer · poignée en bas à droite pour redimensionner · toute zone de texte est une limite MAX (jamais de débordement)</span>
          <span class="spacer"></span><span class="pill" id="d-overflow">✓ Aucun débordement</span>
        </div>
        <div class="card tight" style="margin-top:12px">
          <div class="row" style="justify-content:space-between;margin-bottom:8px"><strong>Fond</strong><span class="muted small">Vide = transparent → la caméra reste visible</span></div>
          <div id="d-bg"></div>
        </div>
      </div>
      <div>
        <div class="card tight" style="margin-bottom:12px">
          <div class="row" style="justify-content:space-between;margin-bottom:8px"><strong>Calques</strong>
            <div class="row"><button class="btn xs" id="d-add-text">+ Texte</button><button class="btn xs" id="d-add-shape">+ Forme</button>
            <button class="btn xs" id="d-add-image">+ Image</button><button class="btn xs" id="d-add-overlay">+ Voile</button></div></div>
          <div class="layer-list" id="d-layers"></div>
        </div>
        <div class="card tight" id="d-props"><div class="empty">Sélectionnez un calque.</div></div>
        <div class="card tight" style="margin-top:12px">
          <strong>Transition</strong>
          <div class="grid2" style="margin-top:9px"><div class="field"><label class="lbl">Type</label><select class="inp" id="d-tr">${Object.entries(TRANSITION_LABELS).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
          <div class="field"><label class="lbl">Durée (ms)</label><input class="inp" type="number" id="d-trd" min="0" max="3000" step="20"></div></div>
          <div class="sep"></div>
          <strong>Taille de la scène</strong>
          <div class="grid2" style="margin-top:9px"><div class="field"><label class="lbl">Largeur</label><input class="inp" type="number" id="d-cw"></div>
          <div class="field"><label class="lbl">Hauteur</label><input class="inp" type="number" id="d-ch"></div></div>
          <div class="hint">8K par défaut (7680 × 4320). Pour une sortie personnalisée, réglez ici le format réel de l'écran.</div>
        </div>
      </div>
    </div>`;
  buildKeySelect();
  $('#d-key',host).onchange = e => { key = e.target.value; selected=null; rebuild(); };
  $('#d-add-text',host).onclick = () => addLayer(textLayer('custom',{x:1200,y:1700,w:5280,h:700},{fontSize:250},'{{content}}'));
  $('#d-add-shape',host).onclick = () => addLayer({id:uid('shp'),type:'shape',box:{x:800,y:1400,w:6080,h:1400},fill:'rgba(8,14,28,.55)',radius:48,border:null,opacity:1,visible:true});
  $('#d-add-image',host).onclick = async () => { const f=await pickFile('image/*,video/*'); if(!f) return;
    try { const r=await store.upload(f,'medias'); addLayer({id:uid('img'),type:'image',box:{x:600,y:600,w:6480,h:3120},src:'/media/'+encodeURIComponent(r.name),fit:'cover',opacity:1,visible:true}); } catch(e){ toast(e.message,'err'); } };
  $('#d-add-overlay',host).onclick = () => addLayer({id:uid('ovl'),type:'overlay',box:{x:0,y:0,w:d().canvas.w,h:d().canvas.h},color:'rgba(0,0,0,.35)',opacity:1,visible:true});
  $('#d-copybas',host).onclick = () => copyTo(key.split(':')[0]+':bas');
  $('#d-copyplein',host).onclick = () => copyTo(key.split(':')[0]+':plein');
  $('#d-dup',host).onclick = async () => { const r=await formDlg('Dupliquer le design',[{name:'n',label:'Nom',value:d().name+' (copie)'}]); if(!r?.n)return;
    const nd=structuredClone(d()); nd.id=r.n; nd.name=r.n; store.patch({designs:{[r.n]:nd}}); buildKeySelect(); key=r.n; $('#d-key',host).value=r.n; rebuild(); toast('Design dupliqué','ok'); };
  $('#d-reset',host).onclick = async () => { if(!await confirmDlg('Rétablir le modèle de base pour ce design ?')) return;
    const def=defaultDesigns()[key]; if(def) store.patch({designs:{[key]:structuredClone(def)}}); rebuild(); toast('Modèle de base rétabli','ok'); };
  $('#d-import',host).onclick = async () => { const f=await pickFile('.json'); if(!f)return; try{ const nd=JSON.parse(await f.text()); nd.id=key; store.patch({designs:{[key]:nd}}); rebuild(); toast('Design importé','ok'); }catch(e){toast(e.message,'err');} };
  $('#d-export',host).onclick = () => download(`design-${key.replace(':','-')}.json`,JSON.stringify(d(),null,2));
  $('#d-save',host).onclick = () => { commit(); toast('Design appliqué — la régie et OBS utilisent immédiatement ce rendu','ok'); };
  $('#d-fill',host).onchange = e => { d().fill = e.target.checked ? 1 : 0; commit(); rebuild(); toast(e.target.checked ? 'Remplissage maximal activé — marges réduites, police agrandie' : 'Marges d’origine rétablies','ok'); };
  $('#d-tr',host).onchange = e => { d().transition={...(d().transition||{}),type:e.target.value}; commit(); };
  $('#d-trd',host).onchange = e => { d().transition={...(d().transition||{}),duration:Number(e.target.value)||0}; commit(); };
  $('#d-cw',host).onchange = e => { d().canvas.w=Number(e.target.value)||7680; commit(); rebuild(); };
  $('#d-ch',host).onchange = e => { d().canvas.h=Number(e.target.value)||4320; commit(); rebuild(); };
  rebuild();
  window.addEventListener('resize', layoutHandles);
  return { onKey: a => { if(a==='sendFullscreen') { commit(); toast('Design appliqué','ok'); } }, destroy: ()=>{ ro?.disconnect(); window.removeEventListener('resize',layoutHandles); } };
}

function d(){ return store.state.designs?.[key] || {}; }
function buildKeySelect(){
  const s=$('#d-key',host); if(!s)return;
  const keys=[...new Set([...Object.keys(store.state.designs||{}), ...defaultDesignsKeyList()])];
  s.innerHTML = keys.map(k=>`<option value="${esc(k)}" ${k===key?'selected':''}>${esc((store.state.designs?.[k]?.name)||k)}</option>`).join('');
}
function defaultDesignsKeyList(){ return ['bible:plein','bible:bas','chants:plein','chants:bas','medias:plein','medias:bas','lowerthird:plein','lowerthird:bas']; }
function copyTo(target){
  const src=structuredClone(d());
  src.id=target; src.name=target; src.type=target.split(':')[1];
  store.patch({designs:{[target]:src}}); toast(`Design copié vers ${target} — ajustez-le librement`,'ok');
}
function addLayer(l){ d().layers=[...(d().layers||[]),l]; selected=l.id; commit(); rebuild(); }
function commit(){ store.patch({designs:{[key]:structuredClone(d())}}); }

function rebuild(){
  const ds = d(); if(!ds?.canvas) return;
  sampleVars = SAMPLE[key] || SAMPLE['bible:plein'];
  stage?.destroy();
  stage = new Stage($('#d-stage',host),{design:ds,onOverflow:o=>{
    const e=$('#d-overflow',host); if(e){ e.textContent=`⚠ ${o.length} zone(s) saturée(s) — réduisez la police ou agrandissez la zone`; e.className='pill off'; }
  }});
  stage.update(sampleVars,{animate:true});
  const e=$('#d-overflow',host); if(e && !$('.fs-text-layer[data-overflow]',$('#d-stage',host))){ e.textContent='✓ Aucun débordement'; e.className='pill ok'; }
  $('#d-tr',host).value=ds.transition?.type||'fade'; $('#d-trd',host).value=ds.transition?.duration??300;
  $('#d-cw',host).value=ds.canvas.w; $('#d-ch',host).value=ds.canvas.h;
  const fillEl = $('#d-fill',host); if (fillEl) fillEl.checked = !!ds.fill;
  paintLayers(); paintProps(); paintBg();
  handles=$('#d-handles',host); layoutHandles();
  if(ro) ro.disconnect(); ro=new ResizeObserver(layoutHandles); ro.observe($('#designer',host));
}

function scaleInfo(){
  const hostEl=$('#designer',host); const c=d().canvas||CANVAS_8K;
  const s=Math.min(hostEl.clientWidth/c.w, hostEl.clientHeight/c.h);
  return { s, ox:(hostEl.clientWidth-c.w*s)/2, oy:(hostEl.clientHeight-c.h*s)/2, c };
}
function layoutHandles(){
  if(!handles) return;
  const {s,ox,oy}=scaleInfo();
  handles.innerHTML='';
  for(const l of d().layers||[]){
    if(l.visible===false) continue;
    const b=l.box||{x:0,y:0,w:100,h:100};
    const h=el(`<div class="layer-box ${selected===l.id?'sel':''}" data-id="${esc(l.id)}">
      <span class="lbl">${esc(l.type==='text'?(l.role||'texte'):l.type)} · ${Math.round(b.w)}×${Math.round(b.h)}</span><span class="h"></span></div>`);
    h.style.left=(ox+b.x*s)+'px'; h.style.top=(oy+b.y*s)+'px';
    h.style.width=Math.max(6,b.w*s)+'px'; h.style.height=Math.max(6,b.h*s)+'px';
    h.addEventListener('pointerdown',ev=>startDrag(ev,l,h));
    handles.appendChild(h);
  }
}
function startDrag(ev,l,hnd){
  ev.preventDefault(); ev.stopPropagation(); selected=l.id; paintLayers(); paintProps(); layoutHandles();
  const {s}=scaleInfo();
  const mode=ev.target.classList.contains('h')?'resize':'move';
  const start={x:ev.clientX,y:ev.clientY,box:{...l.box}};
  const move=e=>{
    const dx=(e.clientX-start.x)/s, dy=(e.clientY-start.y)/s;
    if(mode==='move'){ l.box.x=Math.round(start.box.x+dx); l.box.y=Math.round(start.box.y+dy); }
    else { l.box.w=Math.max(40,Math.round(start.box.w+dx)); l.box.h=Math.max(30,Math.round(start.box.h+dy)); }
    l.box.x=Math.max(0,Math.min(d().canvas.w-40,l.box.x)); l.box.y=Math.max(0,Math.min(d().canvas.h-30,l.box.y));
    l.box.w=Math.min(d().canvas.w-l.box.x,l.box.w); l.box.h=Math.min(d().canvas.h-l.box.y,l.box.h);
    stage.setDesign(d()); stage.update(sampleVars,{animate:false}); layoutHandles(); paintProps(true);
  };
  const up=()=>{ window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); commit(); toast('Calque positionné','ok'); };
  window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
}

function paintLayers(){
  const box=$('#d-layers',host); if(!box)return;
  box.innerHTML=(d().layers||[]).map((l,i)=>`<div class="layer-row ${selected===l.id?'sel':''}" data-id="${esc(l.id)}">
    <span class="ic">${l.type==='text'?'T':l.type==='shape'?'▭':l.type==='image'?'🖼':l.type==='overlay'?'▦':l.type==='media'?'▶':'?'}</span>
    <span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.type==='text'?(l.role||'texte'):l.type)} <span class="muted small">#${i+1}</span></span>
    <button class="btn xs vis" data-id="${esc(l.id)}" title="Afficher/masquer">${l.visible===false?'○':'●'}</button>
    <button class="btn xs up" data-id="${esc(l.id)}">↑</button><button class="btn xs dn" data-id="${esc(l.id)}">↓</button>
    <button class="btn xs danger rm" data-id="${esc(l.id)}">✕</button></div>`).join('') || '<div class="empty">Aucun calque.</div>';
  box.onclick=e=>{
    const b=e.target.closest('button'); const id=b?.dataset.id;
    if(b?.classList.contains('rm')){ d().layers=d().layers.filter(x=>x.id!==id); selected=null; commit(); rebuild(); return; }
    if(b?.classList.contains('vis')){ const l=d().layers.find(x=>x.id===id); l.visible=l.visible===false; commit(); rebuild(); return; }
    if(b?.classList.contains('up')||b?.classList.contains('dn')){
      const arr=d().layers, i=arr.findIndex(x=>x.id===id), j=b.classList.contains('up')?i-1:i+1;
      if(j>=0&&j<arr.length){ [arr[i],arr[j]]=[arr[j],arr[i]]; commit(); rebuild(); } return; }
    selected=id; paintLayers(); paintProps(); layoutHandles();
  };
}

const FONTS=['FREESTREAM Sans','Segoe UI','Inter','Arial','Georgia','Times New Roman','Verdana','Impact','Trebuchet MS','Courier New'];
function field(label,prop,type='number',opts={}){
  const v=opts.value??'';
  if(type==='select') return `<div class="field"><div class="k">${esc(label)}</div><select class="inp" data-p="${prop}">${(opts.options||[]).map(o=>`<option value="${esc(o.value??o)}" ${String(o.value??o)===String(v)?'selected':''}>${esc(o.label??o)}</option>`).join('')}</select></div>`;
  if(type==='color') return `<div class="field"><div class="k">${esc(label)}</div><input type="color" data-p="${prop}" value="${esc(v||'#ffffff')}"></div>`;
  if(type==='text') return `<div class="field"><div class="k">${esc(label)}</div><input class="inp" data-p="${prop}" value="${esc(v)}"></div>`;
  return `<div class="field"><div class="k">${esc(label)}</div><input class="inp" type="number" data-p="${prop}" value="${v}" ${opts.min!==undefined?`min="${opts.min}"`:''} ${opts.max!==undefined?`max="${opts.max}"`:''} step="${opts.step||1}"></div>`;
}
function paintProps(keepFocus=false){
  const box=$('#d-props',host); if(!box)return;
  const l=(d().layers||[]).find(x=>x.id===selected);
  if(!l){ box.innerHTML='<div class="empty">Sélectionnez un calque pour l\'éditer.</div>'; return; }
  let html=`<div class="row" style="justify-content:space-between;margin-bottom:9px"><strong>${esc(l.type==='text'?(l.role||'Texte'):l.type)}</strong><span class="muted small">${esc(l.id.slice(0,12))}</span></div>`;
  if(l.type==='text'){
    const s=l.style||{};
    html+=`<div class="tabs-mini">${['reference','content','version','title','subtitle','section','custom'].map(r=>`<button data-role="${r}" class="${l.role===r?'on':''}">${r}</button>`).join('')}</div>`;
    html+=`<div class="field"><div class="k">Variables ({{…}})</div><input class="inp" data-p="template" value="${esc(l.template||'')}"></div>`;
    html+=`<div class="grid2">${field('Police','fontFamily','select',{value:s.fontFamily,options:FONTS.map(f=>({value:f,label:f}))})}
      ${field('Taille max (px 8K)','fontSize','number',{value:s.fontSize,min:20,max:1200})}
      ${field('Taille MINI (plancher)','minFontSize','number',{value:s.minFontSize,min:10,max:900})}
      ${field('Graisse','fontWeight','number',{value:s.fontWeight,min:100,max:900,step:100})}
      ${field('Couleur','color','color',{value:s.color})}
      ${field('Opacité','opacity','number',{value:s.opacity,min:0,max:1,step:.05})}
      ${field('Alignement','align','select',{value:s.align,options:['left','center','right','justify']})}
      ${field('Vertical','valign','select',{value:s.valign,options:['top','middle','bottom']})}
      ${field('Interligne','lineHeight','number',{value:s.lineHeight,min:.8,max:2.5,step:.02})}
      ${field('Espacement lettres','letterSpacing','number',{value:s.letterSpacing,min:-20,max:60})}
      ${field('Casse','textTransform','select',{value:s.textTransform,options:['none','uppercase','lowercase','capitalize']})}
      ${field('Décoration','textDecoration','select',{value:s.textDecoration,options:['none','underline','line-through','overline']})}
      ${field('Surlignage','highlight','color',{value:s.highlight||'#ffd479'})}
      ${field('Ombre','shadow','text',{value:s.shadow||''})}
      ${field('Contour couleur','strokeColor','color',{value:s.strokeColor||'#000000'})}
      ${field('Épaisseur contour','strokeWidth','number',{value:s.strokeWidth||0,min:0,max:30})}
      ${field('Marge interne','padding','number',{value:s.padding||0,min:0,max:400})}
      ${field('Fond du texte','bgColor','color',{value:s.bgColor||'#000000'})}
      ${field('Opacité du fond','bgOpacity','number',{value:s.bgOpacity||0,min:0,max:1,step:.05})}
      ${field('Coins arrondis','borderRadius','number',{value:s.borderRadius||0,min:0,max:400})}
      ${field('Retrait 1re ligne','textIndent','number',{value:s.textIndent||0})}</div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" data-p="autoFit" ${s.autoFit!==false?'checked':''}> Ajustement automatique — ne JAMAIS déborder</label>
      <div class="hint">La zone est la limite maximale. Le texte grandit jusqu'à « Taille max » et se réduit seul si nécessaire. Pour les chants, le plancher garantit les grands caractères.</div>`;
  } else if(l.type==='shape'){
    html+=`<div class="grid2">${field('Couleur','fill','color',{value:l.fill?.startsWith('#')?l.fill:'#0a1020'})}
      ${field('Coins','radius','number',{value:l.radius||0,min:0,max:600})}${field('Opacité','opacity','number',{value:l.opacity??1,min:0,max:1,step:.05})}</div>
      <div class="field"><div class="k">Remplissage (CSS)</div><input class="inp" data-p="fill" value="${esc(l.fill||'')}"></div>`;
  } else if(l.type==='overlay'){
    html+=`<div class="field"><div class="k">Couleur / voile (CSS)</div><input class="inp" data-p="color" value="${esc(l.color||'')}"></div>
      ${field('Opacité','opacity','number',{value:l.opacity??1,min:0,max:1,step:.05})}`;
  } else if(l.type==='image'){
    html+=`<div class="field"><div class="k">Source</div><input class="inp" data-p="src" value="${esc(l.src||'')}"></div>
      <div class="grid2">${field('Ajustement','fit','select',{value:l.fit,options:['cover','contain','fill']})}${field('Opacité','opacity','number',{value:l.opacity??1,min:0,max:1,step:.05})}</div>
      <button class="btn xs" id="p-pickimg">🖼 Choisir une image</button>`;
  }
  html+=`<div class="sep"></div><div class="grid2">${field('X','box.x','number',{value:l.box?.x||0})}${field('Y','box.y','number',{value:l.box?.y||0})}
    ${field('Largeur','box.w','number',{value:l.box?.w||100})}${field('Hauteur','box.h','number',{value:l.box?.h||100})}</div>`;
  box.innerHTML=html;
  box.onclick=async e=>{
    const r=e.target.closest('[data-role]'); if(r){ l.role=r.dataset.role; commit(); paintProps(); paintLayers(); refreshStage(); return; }
    if(e.target.closest('#p-pickimg')){ const f=await pickFile('image/*,video/*'); if(!f)return;
      try{ const o=await store.upload(f,'medias'); l.src='/media/'+encodeURIComponent(o.name); commit(); paintProps(); refreshStage(); }catch(er){toast(er.message,'err');} }
  };
  const active=keepFocus?document.activeElement:null;
  box.oninput=e=>{ const t=e.target.closest('[data-p]'); if(!t)return; setProp(l,t.dataset.p,t.type==='checkbox'?t.checked:(t.type==='number'?Number(t.value):t.value)); refreshStage(); };
  box.onchange=box.oninput;
  if(active?.dataset?.p){ const n=box.querySelector(`[data-p="${active.dataset.p}"]`); if(n){n.focus(); if(n.select) n.select();} }
}
function setProp(l,p,v){
  if(p.startsWith('box.')){ l.box=l.box||{}; l.box[p.slice(4)]=Number(v)||0; }
  else if(l.type==='text' && ['template','autoFit'].indexOf(p)<0){ l.style=l.style||{}; l.style[p]=v; }
  else l[p]=v;
  commit();
}
function refreshStage(){ stage.setDesign(d()); stage.update(sampleVars,{animate:false}); layoutHandles();
  const warn=$('#d-overflow',host); if(warn && !$('.fs-text-layer[data-overflow]',$('#d-stage',host))){ warn.textContent='✓ Aucun débordement'; warn.className='pill ok'; } }

function paintBg(){
  const box=$('#d-bg',host); if(!box)return; const bg=d().background||{};
  box.innerHTML=`<div class="grid3">
    <div class="field"><div class="k">Type</div><select class="inp" data-b="kind">
      ${['transparent','color','image','video'].map(k=>`<option value="${k}" ${bg.kind===k?'selected':''}>${k}</option>`).join('')}</select></div>
    <div class="field"><div class="k">Couleur</div><input type="color" data-b="color" value="${esc(bg.color||'#000000')}"></div>
    <div class="field"><div class="k">Source (image/vidéo)</div><input class="inp" data-b="src" value="${esc(bg.src||'')}"></div>
    <div class="field"><div class="k">Flou (px)</div><input class="inp" type="number" data-b="blur" value="${bg.blur||0}"></div>
    <div class="field"><div class="k">Luminosité</div><input class="inp" type="number" step="0.05" data-b="brightness" value="${bg.brightness??1}"></div>
    <div class="field"><div class="k">Opacité</div><input class="inp" type="number" step="0.05" data-b="opacity" value="${bg.opacity??1}"></div></div>
    <div class="row" style="margin-top:8px"><button class="btn xs" id="b-pick">🖼 Choisir un fond</button>
      <label class="chk"><input type="checkbox" data-b="muted" ${bg.muted!==false?'checked':''}> Vidéo sans son</label>
      <label class="chk"><input type="checkbox" data-b="loop" ${bg.loop!==false?'checked':''}> Boucle</label></div>
    <div class="hint">Le fond est construit UNE SEULE fois et reste figé : seules les zones de texte changent pendant le culte. Cela évite tout scintillement sur les vidéos de fond.</div>`;
  box.oninput=e=>{ const t=e.target.closest('[data-b]'); if(!t)return; d().background=d().background||{};
    d().background[t.dataset.b]=t.type==='checkbox'?t.checked:(t.type==='number'?Number(t.value):t.value); commit(); refreshStage(); };
  box.onchange=box.oninput;
  box.onclick=async e=>{ if(!e.target.closest('#b-pick'))return; const f=await pickFile('image/*,video/*'); if(!f)return;
    try{ const o=await store.upload(f,'medias'); d().background.src='/media/'+encodeURIComponent(o.name);
      d().background.kind=/\.(mp4|webm|mov|mkv)$/i.test(o.name)?'video':'image'; commit(); paintBg(); refreshStage(); toast('Fond appliqué (copié dans le projet)','ok'); }catch(er){toast(er.message,'err');} };
}
export { };
