/**
 * État partagé en temps réel (SSE) + miroir navigateur (IndexedDB) + repli sans serveur.
 * Trois niveaux de robustesse, dans l'ordre :
 *   1. serveur local + SSE         → sync instantanée vers OBS
 *   2. BroadcastChannel            → sync entre onglets si le serveur tombe
 *   3. fichier donnees/etat/live.js→ les sorties OBS continuent même serveur éteint
 */
import { defaultState, mergeState, ensureDefaults } from './defaults.js';

const DB_NAME = 'freestream';
const DB_STORE = 'kv';

function openDB() {
  return new Promise(resolve => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function idbGet(db, key) {
  return new Promise(res => { if (!db) return res(null); try { const t = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); } catch { res(null); } });
}
async function idbSet(db, key, val) {
  return new Promise(res => { if (!db) return res(false); try { const t = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(val, key); t.onsuccess = () => res(true); t.onerror = () => res(false); } catch { res(false); } });
}

export class Store {
  constructor() {
    this.state = defaultState();
    this.listeners = new Set();
    this.mode = 'server';
    this.connected = false;
    this.es = null;
    this.bc = null;
    this.db = null;
    this._queue = [];
    this._pollTimer = null;
    this._lastRev = -1;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(origin = 'remote') { for (const fn of this.listeners) { try { fn(this.state, origin); } catch (e) { console.error(e); } } }

  async init({ role = 'regie', id = null } = {}) {
    this.role = role; this.id = id;
    this.db = await openDB();
    const cached = await idbGet(this.db, 'state');
    if (cached) mergeState(this.state, cached);

    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel('freestream');
      this.bc.onmessage = e => { if (e.data?.type === 'state') this._accept(e.data.state, 'broadcast'); };
    }

    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      this._accept(await r.json(), 'init');
      this._connectSSE();
      this.connected = true;
      for (const p of this._queue.splice(0)) await this._post('/api/patch', p);
    } catch {
      this.mode = 'offline';
      this.connected = false;
      await this._restoreFolderHandle();
      this._startFileFallback();
    }
    ensureDefaults(this.state);
    this._emit('init');
    this._presence();
    return this;
  }

  /* ------------------------------------------------------------------
   * MODE DOSSIER — 100 % sans serveur, sans installation.
   * La régie obtient (une seule fois) la main sur le dossier du projet via
   * l'API File System Access de Chrome/Edge, puis écrit elle-même
   * donnees/etat/live.js. Les sorties OBS relisent ce fichier par balise
   * <script>, ce qui contourne les restrictions CORS des pages file://.
   * ------------------------------------------------------------------ */
  get folderModeSupported() { return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'; }

  async _restoreFolderHandle() {
    const cached = await idbGet(this.db, 'folderHandle');
    if (!cached || !this.folderModeSupported) return false;
    try {
      const perm = await cached.queryPermission?.({ mode: 'readwrite' });
      if (perm === 'granted') { this.dirHandle = cached; this.folderMode = true; return true; }
      this._pendingHandle = cached;
    } catch { }
    return false;
  }

  /** À appeler sur un clic utilisateur (exigence de l'API navigateur). */
  async enableFolderMode() {
    if (!this.folderModeSupported) {
      throw new Error('Cette fonction nécessite Chrome ou Edge (API File System Access). Sinon lancez DEMARRER.bat.');
    }
    try {
      let h = this._pendingHandle;
      if (h) {
        const p = await h.requestPermission?.({ mode: 'readwrite' });
        if (p !== 'granted') h = null;
      }
      if (!h) h = await window.showDirectoryPicker({ id: 'freestream', mode: 'readwrite', startIn: 'desktop' });
      this.dirHandle = h; this._pendingHandle = null; this.folderMode = true;
      await idbSet(this.db, 'folderHandle', h);
      await this._writeStateFile();
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
      throw e;
    }
  }

  async _writeStateFile() {
    if (!this.dirHandle) return;
    clearTimeout(this._fileTimer);
    this._fileTimer = setTimeout(async () => {
      try {
        await this._fileWrite('donnees/etat/live.js', 'window.FREESTREAM_STATE=' + JSON.stringify(strip(this.state)) + ';');
        await this._fileWrite('donnees/etat/state.json', JSON.stringify(strip(this.state), null, 2));
      } catch (e) { console.warn('Écriture du dossier impossible', e); }
    }, 100);
  }

  async _fileWrite(rel, content) {
    const parts = rel.split('/');
    let dir = this.dirHandle;
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
    const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }

  /** Sauvegarde d'un document en mode dossier (miroir de /api/save). */
  async _folderSave(folder, name, data) {
    if (!this.dirHandle) return null;
    const clean = String(name).replace(/[^a-zA-Z0-9._\- ]/g, '_').replace(/\.\.+/g, '.');
    await this._fileWrite(`donnees/${folder}/${clean}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    return { name: clean, offline: true };
  }

  _connectSSE() {
    if (typeof EventSource === 'undefined') return;
    try {
      this.es = new EventSource('/api/events');
      this.es.addEventListener('state', e => {
        try { this._accept(JSON.parse(e.data), 'sse'); this.connected = true; } catch { }
      });
      this.es.onerror = () => { this.connected = false; };
      this.es.onopen = () => { this.connected = true; };
    } catch { }
  }

  _accept(next, origin) {
    if (!next || typeof next !== 'object') return;
    if (typeof next.rev === 'number' && next.rev < this._lastRev) return;
    this._lastRev = next.rev ?? this._lastRev;
    mergeState(this.state, next);
    ensureDefaults(this.state);          // migration : ne perd jamais une nouvelle sortie/design
    idbSet(this.db, 'state', this.state);
    this._emit(origin);
  }

  /** Repli fichier : relecture de live.js par balise <script> (contourne CORS file://). */
  _startFileFallback() {
    if (this.role !== 'output') return;
    const load = () => {
      try {
        const s = document.createElement('script');
        s.src = '../donnees/etat/live.js?t=' + Date.now();
        s.onload = () => {
          if (window.FREESTREAM_STATE) {
            const st = window.FREESTREAM_STATE;
            if (st.rev !== this._lastRev) this._accept(st, 'file');
          }
          s.remove();
        };
        s.onerror = () => s.remove();
        document.head.appendChild(s);
      } catch { }
    };
    load();
    clearInterval(this._pollTimer);
    this._pollTimer = setInterval(load, 400);
  }

  async _post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.text()).slice(0, 200));
    return r.json();
  }

  /** Patch profond, application optimiste immédiate (interface ultra-rapide). */
  patch(patch, { broadcast = true } = {}) {
    mergeState(this.state, patch);
    this.state.rev = (this.state.rev || 0) + 1;
    idbSet(this.db, 'state', this.state);
    this._emit('local');
    if (broadcast && this.bc) this.bc.postMessage({ type: 'state', state: strip(this.state) });
    if (this.connected) this._post('/api/patch', { patch }).catch(() => { this.connected = false; this._queue.push({ patch }); });
    else if (this.mode === 'server') this._queue.push({ patch });
    if (this.folderMode) this._writeStateFile();
    return this.state;
  }

  setState(next) { return this.patch(next); }

  /* ---------------- helpers document ---------------- */
  async list(folder) {
    try { return (await (await fetch('/api/list?folder=' + encodeURIComponent(folder))).json()).items || []; }
    catch { return this._localList(folder); }
  }
  async save(folder, name, data) {
    const local = { data, savedAt: Date.now() };
    idbSet(this.db, `doc:${folder}:${name}`, local);
    if (this.folderMode && this.dirHandle) {
      const r = await this._folderSave(folder, name, data);
      if (r) return r;
    }
    try { return await this._post('/api/save', { folder, name, data }); } catch { return { name, offline: true }; }
  }
  async load(folder, name) {
    const c = await idbGet(this.db, `doc:${folder}:${name}`);
    if (c) return c.data;
    try { return (await (await fetch(`/donnees/${folder}/${encodeURIComponent(name)}`, { cache:'no-store' })).json()); }
    catch { return null; }
  }
  async remove(folder, name) {
    try { return await this._post('/api/delete', { folder, name }); } catch { return { ok: false }; }
  }
  async _localList(folder) {
    const out = [];
    const db = this.db;
    if (!db) return out;
    return new Promise(res => {
      try {
        const t = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).openCursor();
        t.onsuccess = e => {
          const c = e.target.result;
          if (c) { if (String(c.key).startsWith(`doc:${folder}:`)) out.push({ name: String(c.key).split(':').slice(2).join(':') }); c.continue(); }
          else res(out);
        };
        t.onerror = () => res(out);
      } catch { res(out); }
    });
  }
  async upload(file, folder) {
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'x-fs-folder': folder, 'x-fs-name': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async copyExternal(src, folder) {
    return this._post('/api/copy', { src, folder });
  }
  /** Duplication RÉELLE d'un fichier déjà présent dans un dossier du projet. */
  async duplicate(folder, name) {
    if (this.folderMode && this.dirHandle) {
      try {
        const raw = await this._folderRead(folder, name);
        const ext = String(name).match(/\.[^.]+$/)?.[0] || '';
        const stem = String(name).replace(/\.[^.]+$/, '');
        const copy = `${stem} (copie)${ext}`;
        await this._fileWrite(`donnees/${folder}/${copy}`, raw);
        return { ok: true, name: copy, copied: true };
      } catch (e) { console.warn('Duplication en mode dossier impossible', e); }
    }
    try { return await this._post('/api/duplicate', { folder, name }); }
    catch { return { ok: false, offline: true }; }
  }
  async _folderRead(folder, name) {
    if (!this.dirHandle) return '';
    let dir = this.dirHandle;
    for (const p of ['donnees', folder]) dir = await dir.getDirectoryHandle(p, { create: false });
    const fh = await dir.getFileHandle(name, { create: false });
    // On renvoie le File (Blob) : préserve parfaitement les vidéos/images binaires.
    return await fh.getFile();
  }

  _presence() {
    if (this.role !== 'output' || !this.connected) return;
    const ping = () => fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: this.id, url: location.pathname, type: this.type, tool: this.tool }) }).catch(() => {});
    ping(); setInterval(ping, 8000);
  }
}

function strip(o) { try { return JSON.parse(JSON.stringify(o)); } catch { return o; } }

export const store = new Store();
