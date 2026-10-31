// Onglet LOWERTHIRDS — contenus personnalisés éditables, durée + transitions type PowerPoint.
import { store, esc, $, $$, el, toast, richEditor, setWork, sendLowerThird, cutLowerThird, clearOutput, pickFile, download, confirmDlg, formDlg } from './core.js';
import { TRANSITION_LABELS } from '../core/renderer.js';
import { sanitizeHtml, toPlainText } from '../core/sanitize.js';

let host = null, list = [], sel = null, sub = 'liste';
let edTitle = null, edSub = null, saveT = null;

const uidLT = () => 'lt-' + Date.now().toString(36);

export async function mount(container) {
  host = container;
  host.innerHTML = `
    <div class="tool-head"><h1>▭ Lowerthirds</h1><span class="pill acc">Calque indépendant : n'efface ni la Bible, ni les chants, ni le média en cours</span></div>
    <div class="subtabs" id="lt-sub">
      <button class="subtab on" data-s="liste">Bibliothèque</button>
      <button class="subtab" data-s="editeur">Éditeur</button>
      <button class="subtab" data-s="diffusion">Diffusion</button>
    </div><div id="lt-body"></div>`;
  $('#lt-sub',host).onclick = e => { const b=e.target.closest('[data-s]'); if(!b) return; sub=b.dataset.s; $$('#lt-sub .subtab',host).forEach(x=>x.classList.toggle('on',x===b)); render(); };
  await reload(); render();
  return { onKey };
}
async function reload() {
  const files = await store.list('lowerthirds');
  list = [];
  for (const f of files.filter(x=>/\.json$/i.test(x.name))) {
    try { const d = await store.load('lowerthirds', f.name); if (d) list.push({ ...d, _file:f.name }); } catch { }
  }
  if (!list.length) {
    const demo = blank('Annonce de bienvenue');
    demo.titleHtml = 'Bienvenue à l\'église'; demo.subtitleHtml = 'Culte du dimanche · 10h00';
    await persist(demo); list = [{ ...demo, _file:`lt-${demo.id}.json` }];
  }
  const requested = list.find(x=>x.id===store.state.lowerthird?.currentId);
  if (requested) sel = requested;
  else if (!sel || !list.find(x=>x.id===sel.id)) sel = list[0];
}
function blank(name) { return { id:uidLT(), name:name||'Nouveau lowerthird', titleHtml:'', subtitleHtml:'', duration:8,
  transition:'slide-left', outTransition:'fade', transitionDuration:420, outDuration:320, target:'bas',
  background:null, bgKind:'transparent', createdAt:Date.now(), updatedAt:Date.now() }; }
async function persist(lt) {
  lt.updatedAt = Date.now();
  const name = lt._file || `lt-${lt.id}.json`;
  const c = { ...lt }; delete c._file;
  const r = await store.save('lowerthirds', name, c); lt._file = r.name || name;
}

function render(){ const b=$('#lt-body',host); if(!b) return;
  if(sub==='liste') renderListe(b); else if(sub==='editeur') renderEditeur(b); else renderDiffusion(b); refreshPreview(); }

function renderListe(box) {
  box.innerHTML = `
    <div class="card tight" style="margin-bottom:12px"><div class="row">
      <input class="inp grow" id="lt-q" placeholder="🔍 Rechercher un lowerthird…">
      <button class="btn primary" id="lt-new">+ Créer</button><button class="btn" id="lt-import">📥 Importer</button>
      <button class="btn" id="lt-export">📤 Exporter</button></div></div>
    <div class="grid2" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card tight"><strong>${list.length} lowerthird(s)</strong><div id="lt-list" style="margin-top:10px;max-height:52vh;overflow:auto"></div></div>
      <div class="card tight"><strong>Aperçu rapide</strong><div id="lt-peek" style="margin-top:10px"></div></div>
    </div>`;
  const paint = (q='') => {
    const f = list.filter(x=>x.name.toLowerCase().includes(q.toLowerCase()) || toPlainText(x.titleHtml).toLowerCase().includes(q.toLowerCase()));
    $('#lt-list',box).innerHTML = f.length ? f.map(x=>`<div class="lt-row ${sel?.id===x.id?'sel':''}" data-id="${esc(x.id)}">
        <span class="pill">${x.duration||0}s</span><span class="nm">${esc(x.name)}</span>
        <span class="muted small">${esc(TRANSITION_LABELS[x.transition]||x.transition)}</span>
        <button class="btn xs dup" data-id="${esc(x.id)}">⧉</button><button class="btn xs ren" data-id="${esc(x.id)}">✎</button>
        <button class="btn xs danger del" data-id="${esc(x.id)}">✕</button></div>`).join('') : '<div class="empty">Aucun résultat.</div>';
    $('#lt-peek',box).innerHTML = sel ? `<div class="pill acc">${esc(sel.name)}</div>
      <div style="margin-top:10px;padding:14px;border-radius:10px;background:linear-gradient(90deg,#16203a,#0b0f18);border-left:4px solid var(--accent)">
        <div style="font-size:19px;font-weight:800">${sel.titleHtml}</div><div class="muted" style="margin-top:5px">${sel.subtitleHtml}</div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="lt-open">Éditer</button><button class="btn blue" id="lt-send">📺 Afficher</button></div>` : '';
  };
  paint();
  $('#lt-q',box).oninput = e => paint(e.target.value);
  $('#lt-new',box).onclick = async () => { const r=await formDlg('Nouveau lowerthird',[{name:'name',label:'Nom',value:'Nouveau lowerthird'}]); if(!r?.name) return;
    const lt=blank(r.name); await persist(lt); await reload(); sel=list.find(x=>x.id===lt.id)||list[0]; if(sel) store.patch({lowerthird:{currentId:sel.id}}); sub='editeur'; render(); };
  $('#lt-export',box).onclick = () => download('lowerthirds-freestream.json',JSON.stringify(list.map(x=>{const c={...x};delete c._file;return c;}),null,2));
  $('#lt-import',box).onclick = async () => { const f=await pickFile('.json'); if(!f) return;
    try { const d=JSON.parse(await f.text()); const arr=Array.isArray(d)?d:[d]; for(const x of arr){ await persist({...blank(x.name||'Importé'),...x,id:uidLT()}); } await reload(); render(); toast(`${arr.length} importé(s)`,'ok'); } catch(e){ toast('Import impossible : '+e.message,'err'); } };
  $('#lt-list',box).onclick = async e => {
    const del=e.target.closest('.del'),ren=e.target.closest('.ren'),dup=e.target.closest('.dup');
    if(del){ const x=list.find(y=>y.id===del.dataset.id); if(!await confirmDlg(`Supprimer « ${x.name} » ?`)) return; await store.remove('lowerthirds',x._file); await reload(); render(); return; }
    if(ren){ const x=list.find(y=>y.id===ren.dataset.id); const r=await formDlg('Renommer',[{name:'name',label:'Nom',value:x.name}]); if(!r?.name)return; x.name=r.name; await persist(x); await reload(); render(); return; }
    if(dup){ const x=list.find(y=>y.id===dup.dataset.id); const n={...structuredClone(x),id:uidLT(),name:x.name+' (copie)',createdAt:Date.now()}; delete n._file; await persist(n); await reload(); render(); toast('Dupliqué','ok'); return; }
    const d=e.target.closest('[data-id]'); if(d){ sel=list.find(x=>x.id===d.dataset.id); if(sel) store.patch({lowerthird:{currentId:sel.id}}); paint($('#lt-q',box).value); }
  };
  const o=$('#lt-open',box); if(o)o.onclick=()=>{sub='editeur';$$('#lt-sub .subtab',host).forEach(x=>x.classList.toggle('on',x.dataset.s==='editeur'));render();};
  const s=$('#lt-send',box); if(s)s.onclick=()=>sendLT();
}

function renderEditeur(box) {
  if(!sel){ box.innerHTML='<div class="empty">Sélectionnez un lowerthird.</div>'; return; }
  const opts = Object.entries(TRANSITION_LABELS).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('');
  box.innerHTML = `
    <div class="card tight" style="margin-bottom:12px">
      <div class="row"><input class="inp grow" id="l-name" value="${esc(sel.name)}" placeholder="Nom du lowerthird">
        <button class="btn primary" id="l-save">💾 Enregistrer</button><button class="btn blue" id="l-send">📺 Afficher maintenant</button></div>
    </div>
    <div class="grid2" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card tight">
        <div class="field"><label class="lbl">Titre (toutes mises en forme)</label><div id="l-title"></div></div>
        <div class="field"><label class="lbl">Sous-titre / détail</label><div id="l-sub"></div></div>
        <div class="sep"></div>
        <div class="row"><button class="btn" id="l-bg">🖼 Importer un visuel (Photoshop/PNG)</button><button class="btn" id="l-bgclear">✕ Retirer</button></div>
        <div class="hint">Importez votre forme rectangulaire exportée : elle sert de calque de fond, et les zones de texte restent ajustables dans l'onglet Designs.</div>
        <div id="l-bgprev" style="margin-top:9px"></div>
      </div>
      <div class="card tight">
        <h3>Diffusion</h3>
        <div class="grid2">
          <div class="field"><label class="lbl">Durée d'affichage (s) · 0 = permanent</label><input class="inp" type="number" id="l-dur" min="0" max="3600" value="${sel.duration||0}"></div>
          <div class="field"><label class="lbl">Sortie cible</label><select class="inp" id="l-target"><option value="bas" ${sel.target==='bas'?'selected':''}>Bas centré</option><option value="plein" ${sel.target==='plein'?'selected':''}>Plein écran</option></select></div>
          <div class="field"><label class="lbl">Transition d'entrée</label><select class="inp" id="l-tin">${opts}</select></div>
          <div class="field"><label class="lbl">Transition de sortie</label><select class="inp" id="l-tout">${opts}</select></div>
          <div class="field"><label class="lbl">Durée entrée (ms)</label><input class="inp" type="number" id="l-din" min="0" max="4000" step="50" value="${sel.transitionDuration??420}"></div>
          <div class="field"><label class="lbl">Durée sortie (ms)</label><input class="inp" type="number" id="l-dout" min="0" max="4000" step="50" value="${sel.outDuration??320}"></div>
        </div>
        <div class="hint">Transitions type PowerPoint : fondu, glisser, zoom, balayage… appliquées à l'identique dans l'aperçu et dans OBS.</div>
      </div>
    </div>`;
  $('#l-tin',box).value = sel.transition || 'fade'; $('#l-tout',box).value = sel.outTransition || 'fade';
  edTitle = richEditor({placeholder:'Titre…',html:sel.titleHtml||'',height:'90px',onChange:queue});
  edSub = richEditor({placeholder:'Sous-titre…',html:sel.subtitleHtml||'',height:'75px',onChange:queue});
  $('#l-title',box).appendChild(edTitle); $('#l-sub',box).appendChild(edSub);
  const bgp = $('#l-bgprev',box);
  const paintBg = () => bgp.innerHTML = sel.background ? `<img src="${esc(sel.background)}" style="width:100%;border-radius:8px;border:1px solid var(--line)">` : '<div class="empty">Aucun visuel — fond transparent (caméra visible).</div>';
  paintBg();
  $('#l-bg',box).onclick = async () => { const f=await pickFile('image/*'); if(!f) return;
    try { const r=await store.upload(f,'medias'); attachDesignBackground('/media/'+encodeURIComponent(r.name)); sel.background='/media/'+encodeURIComponent(r.name); await persist(sel); paintBg(); toast('Visuel copié dans le projet et appliqué au calque','ok'); } catch(e){ toast('Copie impossible : '+e.message,'err'); } };
  $('#l-bgclear',box).onclick = async () => { sel.background=null; attachDesignBackground(null); await persist(sel); paintBg(); };
  $('#l-save',box).onclick = async () => { await save(); toast('Lowerthird enregistré','ok'); };
  $('#l-send',box).onclick = async () => { await save(); sendLT(); };
  $('#l-name',box).oninput = queue;
  for (const id of ['l-dur','l-target','l-tin','l-tout','l-din','l-dout']) $('#'+id,box).onchange = queue;
}
function queue(){ clearTimeout(saveT); saveT=setTimeout(()=>save(),500); refreshPreview(); }
async function save(){
  if(!sel) return;
  const n=$('#l-name',host); if(n) sel.name=n.value;
  if(edTitle) sel.titleHtml=sanitizeHtml(edTitle.getValue());
  if(edSub) sel.subtitleHtml=sanitizeHtml(edSub.getValue());
  const g=id=>{const e=$('#'+id,host);return e?e.value:null;};
  const dur=g('l-dur'); if(dur!==null) sel.duration=Number(dur)||0;
  const tg=g('l-target'); if(tg!==null) sel.target=tg;
  const ti=g('l-tin'); if(ti!==null) sel.transition=ti;
  const to=g('l-tout'); if(to!==null) sel.outTransition=to;
  const di=g('l-din'); if(di!==null) sel.transitionDuration=Number(di)||0;
  const dout=g('l-dout'); if(dout!==null) sel.outDuration=Number(dout)||0;
  await persist(sel); refreshPreview();
}
/** Le visuel importé alimente le calque image du design « lowerthird:bas ». */
function attachDesignBackground(src){
  const designs = structuredClone(store.state.designs||{});
  const d = designs['lowerthird:bas']; if(!d) return;
  const img = (d.layers||[]).find(l=>l.type==='image');
  if(img) img.src = src; else d.layers.unshift({id:'lt-bg',type:'image',box:{x:900,y:3180,w:5880,h:760},src,fit:'fill',opacity:1,visible:true});
  store.patch({designs});
}

function renderDiffusion(box){
  const lt = store.state.live?.lowerthird;
  const active = lt && !lt.cut && (!lt.duration || Date.now()-lt.startedAt < lt.duration*1000);
  box.innerHTML = `
    <div class="card tight" style="margin-bottom:12px">
      <div class="row"><span class="pill ${active?'ok':'off'}">${active?'● En cours':'○ Aucun lowerthird à l\'antenne'}</span>
        <span class="spacer"></span><button class="btn blue" id="x-send">📺 Afficher</button>
        <button class="btn danger" id="x-cut">✕ Couper maintenant</button></div>
    </div>
    <div class="grid2" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="card tight"><strong>File d'envoi rapide</strong><div id="x-list" style="margin-top:10px;max-height:50vh;overflow:auto"></div></div>
      <div class="card tight"><strong>Contenu actuel</strong><div class="msg-preview" id="x-cur" style="margin-top:10px"></div></div>
    </div>`;
  $('#x-list',box).innerHTML = list.map(x=>`<div class="lt-row" data-id="${esc(x.id)}"><span class="pill">${x.duration||0}s</span><span class="nm">${esc(x.name)}</span>
      <span class="muted small">${esc(toPlainText(x.titleHtml).slice(0,26))}</span><button class="btn xs primary go" data-id="${esc(x.id)}">Afficher</button></div>`).join('');
  $('#x-list',box).onclick = e => { const d=e.target.closest('[data-id]'); if(!d)return; sel=list.find(x=>x.id===d.dataset.id); if(sel) store.patch({lowerthird:{currentId:sel.id}}); sendLT(); renderDiffusion(box); };
  $('#x-cur',box).innerHTML = active ? `${lt.vars?.title||''}<div class="muted" style="font-size:15px;margin-top:8px">${lt.vars?.subtitle||''}</div>` : '<span class="muted">Rien à l\'antenne.</span>';
  $('#x-send',box).onclick = async ()=>{ await save(); sendLT(); renderDiffusion(box); };
  $('#x-cut',box).onclick = ()=>{ cutLowerThird(); renderDiffusion(box); toast('Lowerthird coupé'); };
}

function refreshPreview(){
  if(!sel) return;
  const vars = { title:sel.titleHtml||'', subtitle:sel.subtitleHtml||'' };
  setWork({ bas:{designId:'lowerthird:bas',vars} });
}
function sendLT(){
  if(!sel) return;
  if (store.state.lowerthird?.currentId !== sel.id) store.patch({lowerthird:{currentId:sel.id}});
  const vars = { title:sel.titleHtml||'', subtitle:sel.subtitleHtml||'' };
  sendLowerThird({ id:sel.id, designId: sel.target==='plein'?'lowerthird:plein':'lowerthird:bas', vars,
    duration:Number(sel.duration)||0, transition:sel.transition||'slide-left', outTransition:sel.outTransition||'fade',
    transitionDuration:Number(sel.transitionDuration)||420, outDuration:Number(sel.outDuration)||320, target:sel.target||'bas' });
}
function onKey(a){ if(a==='confirm'||a==='sendLower') sendLT(); if(a==='clear') cutLowerThird(); if(a==='next'||a==='prev'){
  const i=list.findIndex(x=>x.id===sel?.id); sel=list[(i+(a==='next'?1:-1)+list.length)%list.length]; render(); sendLT(); } }
export { onKey };
