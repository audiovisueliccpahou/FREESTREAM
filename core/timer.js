// Fonctions pures du minuteur — réutilisables par la sortie et par les régies.

/** Temps restant en ms (peut être négatif = dépassement), ou null si arrêté. */
export function remainingMs(state) {
  const m = state?.minuteur || {};
  if (!m.running || m.index < 0) return null;
  const elapsed = Date.now() - (m.startedAt || Date.now());
  return (Number(m.baseMs) || 0) + (Number(m.offsetMs) || 0) - elapsed;
}

/** Format MM:SS ou HH:MM:SS, avec signe « − » en dépassement. */
export function fmt(ms) {
  const neg = ms < 0;
  let t = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(t / 3600); t %= 3600;
  const mm = Math.floor(t / 60); const ss = t % 60;
  const pad = n => String(n).padStart(2, '0');
  return (neg ? '−' : '') + (h ? `${pad(h)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`);
}

export function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}` : `${m} min`;
}
