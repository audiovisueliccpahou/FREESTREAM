// API partagée entre les modules de la régie.
import { store } from '../core/store.js';
import { Stage } from '../core/renderer.js';

export { store };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export function toast(msg, type = '') {
  let box = $('#toasts');
  if (!box) { box = el('<div id="toasts"></div>'); document.body.appendChild(box); }
  const d = el(`<div class="toast ${type}">${esc(msg)}</div>`);
  box.appendChild(d); setTimeout(() => d.remove(), 3200);
}

export function confirmDlg(message, title = 'Confirmer') {
  return new Promise(res => {
    const d = el(`<dialog><h2>${esc(title)}</h2><p class="muted">${esc(message)}</p>
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" data-n>Annuler</button><button class="btn primary" data-y>Confirmer</button></div></dialog>`);
    document.body.appendChild(d); d.showModal();
    d.querySelector('[data-n]').onclick = () => { d.close(); d.remove(); res(false); };
    d.querySelector('[data-y]').onclick = () => { d.close(); d.remove(); res(true); };
  });
}

export function formDlg(title, fields, okLabel = 'Valider') {
  return new Promise(res => {
    const body = fields.map(f => {
      if (f.type === 'checkbox') return `<div class="field"><label class="chk"><input type="checkbox" name="${f.name}" ${f.value?'checked':''}> ${esc(f.label)}</label></div>`;
      if (f.type === 'select') return `<div class="field"><label class="lbl">${esc(f.label)}</label><select class="inp" name="${f.name}">${(f.options||[]).map(o=>`<option value="${esc(o.value??o)}" ${String(o.value??o)===String(f.value)?'selected':''}>${esc(o.label??o)}</option>`).join('')}</select></div>`;
      if (f.type === 'textarea') return `<div class="field"><label class="lbl">${esc(f.label)}</label><textarea class="inp" name="${f.name}" rows="${f.rows||4}">${esc(f.value||'')}</textarea></div>`;
      return `<div class="field"><label class="lbl">${esc(f.label)}</label><input class="inp" name="${f.name}" type="${f.type||'text'}" value="${esc(f.value??'')}" placeholder="${esc(f.placeholder||'')}"></div>`;
    }).join('');
    const d = el(`<dialog style="min-width:380px"><h2>${esc(title)}</h2>${body}
      <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" data-n>Annuler</button><button class="btn primary" data-y>${esc(okLabel)}</button></div></dialog>`);
    document.body.appendChild(d); d.showModal();
    d.querySelector('[data-n]').onclick = () => { d.close(); d.remove(); res(null); };
    d.querySelector('[data-y]').onclick = () => {
      const out = {}; for (const f of fields) { const n = d.querySelector(`[name="${f.name}"]`); out[f.name] = f.type==='checkbox' ? n.checked : (f.type==='number' ? Number(n.value) : n.value); }
      d.close(); d.remove(); res(out);
    };
  });
}

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept = '*/*', multiple = false) {
  return new Promise(res => {
    const i = el(`<input type="file" accept="${accept}" ${multiple?'multiple':''} hidden>`);
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;i.remove();res(value);};
    i.addEventListener('change',()=>finish(multiple?[...i.files]:i.files[0]||null),{once:true});
    i.addEventListener('cancel',()=>finish(multiple?[]:null),{once:true});
    document.body.appendChild(i); i.click();
  });
}

export const fmtTime = ms => { const s = Math.max(0, Math.floor(ms/1000)); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };

/* --------------------------------------------------- aperçus de TRAVAIL */
const workStages = { plein: null, bas: null, coeur: null };
let workDesignIds = { plein: null, bas: null, coeur: null };
let workDesignSignatures = { plein: '', bas: '', coeur: '' };
let workPayloads = { plein: null, bas: null, coeur: null };
const designSignature = design => { try { return JSON.stringify(design || null); } catch { return String(design?.id || ''); } };

export function initWorkPreviews() {
  for (const k of ['plein','bas','coeur']) {
    // #pv-work-* porte lui-même la classe .stage-host (pas d'enfant).
    const host = $(`#pv-work-${k}`) || $(`#pv-work-${k} .stage-host`);
    if (!host) continue;
    const initial = k === 'coeur' ? 'chants:coeur' : `bible:${k}`;
    const design=store.state.designs?.[initial];
    workStages[k] = new Stage(host, { design });
    workDesignIds[k] = initial;
    workDesignSignatures[k] = designSignature(design);
  }
}

/** Affiche dans l'aperçu de travail SANS rien envoyer à OBS. */
export function setWork({ plein, bas, coeur } = {}) {
  for (const [k, p] of Object.entries({ plein, bas, coeur })) {
    const st = workStages[k];
    if (!st || !p) continue;
    const design = store.state.designs?.[p.designId];
    if (!design) continue;
    const signature=designSignature(design);
    if (workDesignIds[k] !== p.designId || workDesignSignatures[k] !== signature) {
      st.setDesign(design); workDesignIds[k] = p.designId; workDesignSignatures[k]=signature;
    }
    workPayloads[k]={designId:p.designId,vars:p.vars||{},media:p.media||{}};
    st.update(p.vars || {}, { media: p.media || {}, animate: true, transition: design.transition });
  }
}

// Maintient les aperçus TRAVAIL en phase avec le design actif, même quand la
// régie est sur l'éditeur et qu'aucun nouveau verset/chant n'est envoyé.
store.on(state => {
  for(const k of ['plein','bas','coeur']){
    const st=workStages[k], payload=workPayloads[k];
    const id=payload?.designId||workDesignIds[k];
    const design=id&&state.designs?.[id];
    if(!st||!design)continue;
    const signature=designSignature(design);
    if(signature===workDesignSignatures[k])continue;
    st.setDesign(design);
    workDesignIds[k]=id;workDesignSignatures[k]=signature;
    st.update(payload?.vars||st.vars||{},{media:payload?.media||{},animate:false,transition:design.transition});
  }
});

/* --------------------------------------------------- envoi vers OBS */
/**
 * bible / chants / médias se CÈDENT LA PLACE mutuellement sur les deux sorties.
 * Le 4ᵉ outil (lowerthird) est un calque indépendant : il n'efface rien.
 */
/**
 * Envoi vers OBS.
 * `keep` permet un envoi PARTIEL sans écraser l'autre sortie. C'est indispensable
 * pour la Bible en mode découpage : quand on fait défiler les sections du bas
 * centré, le plein écran doit rester exactement tel quel (jamais devenir noir).
 *   keep:'fullscreen' → ne touche pas au plein écran
 *   keep:'lower'      → ne touche pas au bas centré
 */
export function sendToObs({ tool, plein, bas, coeur, key, keep = null }) {
  const stamp = key || `${tool}:${Date.now()}`;
  const keepPlein = keep === 'fullscreen' || keep === 'plein';
  const keepBas = keep === 'lower' || keep === 'bas';
  const patch = { live: { tool, blackout: false } };
  if (!keepPlein) patch.live.fullscreen = plein ? { tool, key: stamp + ':p', ...plein } : null;
  if (!keepBas) patch.live.lower = bas ? { tool, key: stamp + ':b', ...bas } : null;
  // La sortie CŒUR n'est modifiée QUE par l'outil Chants : un envoi Bible ou
  // Média ne l'efface pas (moniteur de louange persistant).
  if (coeur) patch.live.coeur = { tool, key: stamp + ':c', ...coeur };
  else if (tool === 'chants') patch.live.coeur = null;
  const prev = store.state.live?.fullscreen;
  if (prev && !keepPlein) patch.live.history = [...(store.state.live.history || []).slice(-19), { at: Date.now(), payload: prev }];
  store.patch(patch);
  toast(`Envoyé à OBS · ${tool}`, 'ok');
}

export function sendLowerThird(lt) {
  store.patch({ live: { lowerthird: { ...lt, startedAt: Date.now(), cut: false } } });
  toast('Lowerthird affiché', 'ok');
}

export function cutLowerThird() {
  const lt = store.state.live?.lowerthird;
  if (!lt) return;
  store.patch({ live: { lowerthird: { ...lt, cut: true } } });
}

export function clearOutput(which = 'both') {
  const patch = { live: {} };
  if (which === 'plein' || which === 'both') patch.live.fullscreen = null;
  if (which === 'bas' || which === 'both') patch.live.lower = null;
  if (which === 'coeur') patch.live.coeur = null;
  if (which === 'both') { patch.live.tool = null; patch.live.lowerthird = null; patch.live.coeur = null; }
  store.patch(patch);
}

export function undo() {
  const h = store.state.live?.history || [];
  if (!h.length) return toast('Rien à annuler');
  const last = h[h.length - 1];
  store.patch({ live: { fullscreen: last.payload, history: h.slice(0, -1) } });
  toast('Retour à l\'affichage précédent');
}

export function toggleBlackout() {
  const b = !store.state.live?.blackout;
  store.patch({ live: { blackout: b } });
  toast(b ? 'Noir — sorties masquées' : 'Sorties rétablies', b ? 'err' : 'ok');
}

/** Éditeur de texte enrichi réutilisable (gras, italique, souligné, barré, couleur, surlignage…). */
export function richEditor({ placeholder = '', html = '', onChange = () => {}, height = '150px' } = {}) {
  const wrap = el(`<div class="editor">
    <div class="tools">
      <button data-c="bold" title="Gras (Ctrl+B)"><b>B</b></button>
      <button data-c="italic" title="Italique (Ctrl+I)"><i>I</i></button>
      <button data-c="underline" title="Souligné (Ctrl+U)"><u>U</u></button>
      <button data-c="strikeThrough" title="Barré"><s>S</s></button>
      <span class="dv"></span>
      <button data-c="hiliteColor" title="Surligner"><mark>▮</mark></button>
      <input type="color" data-color value="#ffffff" title="Couleur du texte" style="width:28px;height:28px;border:1px solid var(--line-2);border-radius:6px;background:#0c111b;cursor:pointer;padding:2px">
      <span class="dv"></span>
      <button data-c="fontSize" data-v="5" title="Plus grand">A↑</button>
      <button data-c="fontSize" data-v="3" title="Taille normale">A</button>
      <button data-c="fontSize" data-v="2" title="Plus petit">A↓</button>
      <span class="dv"></span>
      <button data-c="superscript" title="Exposant">x²</button>
      <button data-c="subscript" title="Indice">x₂</button>
      <button data-c="insertHTML" data-v="<br>" title="Retour à la ligne">↵</button>
      <span class="dv"></span>
      <button data-c="removeFormat" title="Effacer la mise en forme">✕</button>
    </div>
    <div class="area" contenteditable="true" spellcheck="false" data-ph="${esc(placeholder)}" style="min-height:${height}">${html}</div>
  </div>`);
  const area = $('.area', wrap);
  const emit = () => onChange(area.innerHTML);
  area.addEventListener('input', emit);
  area.addEventListener('blur', emit);
  $('.tools', wrap).addEventListener('click', e => {
    const b = e.target.closest('button[data-c]'); if (!b) return;
    e.preventDefault(); area.focus();
    try { document.execCommand(b.dataset.c, false, b.dataset.v || (b.dataset.c === 'hiliteColor' ? '#ffd479' : null)); } catch { }
    emit();
  });
  $('[data-color]', wrap).addEventListener('input', e => {
    area.focus(); try { document.execCommand('foreColor', false, e.target.value); } catch { } emit();
  });
  wrap.setValue = v => { area.innerHTML = v || ''; };
  wrap.getValue = () => area.innerHTML;
  wrap.area = area;
  return wrap;
}
