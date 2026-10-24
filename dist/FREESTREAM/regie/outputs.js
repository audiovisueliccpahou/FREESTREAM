// Onglet SORTIES — tous les liens OBS, création de sorties personnalisées.
import { store, esc, $, $$, el, toast, confirmDlg, formDlg } from './core.js';
import { TOOLS, CANVAS_8K } from '../core/config.js';
import { defaultDesigns } from '../core/defaults.js';

let host = null;
export async function mount(container) {
  host = container;
  host.innerHTML = `
    <div class="tool-head"><h1>🔌 Sorties & liens OBS</h1>
      <span class="pill acc">8K par défaut · 7680 × 4320</span>
      <span class="spacer"></span><button class="btn primary" id="o-new">+ Sortie personnalisée</button>
      <a class="btn" href="../index.html" target="_blank">Ouvrir la page des liens ↗</a></div>
    <div class="card tight" style="margin-bottom:12px">
      <strong>Comment brancher OBS</strong>
      <ol class="muted small" style="margin:8px 0 0;padding-left:20px;line-height:1.8">
        <li>Copiez un lien ci-dessous.</li>
        <li>Dans OBS : <em>Sources → + → Navigateur</em>, collez le lien.</li>
        <li>Réglez Largeur = <code>7680</code>, Hauteur = <code>4320</code> (ou la taille indiquée pour une sortie personnalisée).</li>
        <li>Le fond est transparent : placez la source au-dessus de votre caméra si vous voulez des incrustations.</li>
      </ol>
    </div>
    <div id="o-list"></div>
    <div class="card tight" style="margin-top:14px"><strong>Sorties personnalisées</strong>
      <div class="hint" style="margin-bottom:10px">Créez un écran portrait (ex. 2160 × 3840), un écran de scène ou toute taille précise. Le design est COPIÉ depuis le plein écran : il reste identique jusqu'à ce que vous le modifiez vous-même dans l'onglet Designs.</div>
      <div id="o-custom"></div></div>`;
  $('#o-new',host).onclick = create;
  paint();
  return { onKey:()=>{} };
}
function url(o){ return location.origin + o.path; }
function paint(){
  const outs = store.state.outputs||[];
  const row = o => `<div class="out-row ${o.custom?'custom':''}">
    <div><div class="nm">${o.custom?'🖥':'▣'} ${esc(o.name)}</div><div class="url">${esc(url(o))}</div></div>
    <div class="muted small">${o.w} × ${o.h}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn xs copy" data-u="${esc(url(o))}">📋</button>
      <a class="btn xs" href="${esc(o.path)}" target="_blank">👁</a>
      ${o.custom?`<button class="btn xs edit" data-id="${esc(o.id)}">✎</button><button class="btn xs danger del" data-id="${esc(o.id)}">✕</button>`:''}</div></div>`;
  $('#o-list',host).innerHTML = outs.filter(o=>!o.custom).map(row).join('');
  const c = outs.filter(o=>o.custom);
  $('#o-custom',host).innerHTML = c.length ? c.map(row).join('') : '<div class="empty">Aucune sortie personnalisée.</div>';
  host.onclick = async e => {
    const cp=e.target.closest('.copy'); if(cp){ try{ await navigator.clipboard.writeText(cp.dataset.u); toast('Lien copié','ok'); }catch{ prompt('Copiez :',cp.dataset.u); } }
    const dl=e.target.closest('.del'); if(dl){ if(!await confirmDlg('Supprimer cette sortie ?'))return;
      store.patch({outputs:(store.state.outputs||[]).filter(o=>o.id!==dl.dataset.id)}); paint(); }
    const ed=e.target.closest('.edit'); if(ed){ const o=(store.state.outputs||[]).find(x=>x.id===ed.dataset.id); await create(o); }
  };
}
async function create(existing=null){
  const r = await formDlg(existing?'Modifier la sortie':'Nouvelle sortie personnalisée',[
    {name:'name',label:'Nom',value:existing?.name||'Écran portrait'},
    {name:'w',label:'Largeur (px)',type:'number',value:existing?.w||2160},
    {name:'h',label:'Hauteur (px)',type:'number',value:existing?.h||3840},
    {name:'tool',label:'Contenu suivi',type:'select',value:existing?.tool||'*',options:[{value:'*',label:'Tout (universel)'},...TOOLS.map(t=>({value:t.id,label:t.label}))]},
    {name:'base',label:'Design de départ',type:'select',value:existing?.base||'bible:plein',options:Object.keys(store.state.designs||{}).map(k=>({value:k,label:k}))},
  ], existing?'Enregistrer':'Créer');
  if(!r?.name) return;
  const id = existing?.id || 'out-'+Date.now().toString(36);
  const outs = [...(store.state.outputs||[])];
  const o = { id, name:r.name, type:'custom', tool:r.tool||'*', w:Number(r.w)||2160, h:Number(r.h)||3840,
    path:`/outputs/custom.html?id=${id}`, custom:true, enabled:true, base:r.base };
  const i = outs.findIndex(x=>x.id===id); if(i>=0) outs[i]=o; else outs.push(o);
  const designs = { ...(store.state.designs||{}) };
  if(!existing || existing.base !== r.base){
    const src = designs[r.base] || designs['bible:plein'] || Object.values(defaultDesigns())[0];
    const s = structuredClone(src); const sx=o.w/(src.canvas?.w||7680), sy=o.h/(src.canvas?.h||4320), k=Math.min(sx,sy);
    s.canvas={w:o.w,h:o.h}; s.id='out:'+id; s.name='Design — '+o.name; s.type='custom';
    for(const l of s.layers||[]) if(l.box) l.box={x:Math.round(l.box.x*sx),y:Math.round(l.box.y*sy),w:Math.round(l.box.w*sx),h:Math.round(l.box.h*sy)};
    for(const l of s.layers||[]) if(l.style?.fontSize) l.style.fontSize=Math.round(l.style.fontSize*k);
    designs['out:'+id]=s;
  }
  store.patch({outputs:outs,designs});
  paint(); toast(existing?'Sortie mise à jour':'Sortie créée — design copié du plein écran','ok');
}
