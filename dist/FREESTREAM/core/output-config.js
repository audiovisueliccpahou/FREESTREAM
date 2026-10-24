// Résolution de la configuration d'une sortie. Isolé pour être testable.
export function resolveOutputConfig({ dataset = {}, search = '' } = {}) {
  const qs = new URLSearchParams(search || '');
  return {
    // Le paramètre d'URL est prioritaire : il permet les liens dédiés par outil.
    type: qs.get('type') || dataset.type || 'plein',
    tool: qs.get('tool') || dataset.tool || '*',
    outId: qs.get('id') || dataset.outId || '',
    preview: qs.get('preview') === '1',
  };
}

/** Une sortie filtrée par outil ne s'affiche QUE quand cet outil est à l'antenne. */
export function toolVisible(filter, liveTool) {
  return !filter || filter === '*' || filter === liveTool;
}

/** Le lowerthird cible le bas-centré par défaut, ou le type demandé explicitement. */
export function lowerthirdTargets(lt, type) {
  const target = lt?.target || 'bas';
  if (target === 'both') return type === 'bas' || type === 'plein';
  return target === type;
}

export function lowerthirdActive(lt, now = Date.now()) {
  if (!lt || lt.cut) return false;
  const seconds = Number(lt.duration) || 0;
  if (!seconds) return true;                  // 0 = jusqu'à nouvelle action
  // ATTENTION : la durée est saisie en SECONDES, les horodatages en MILLISECONDES.
  return now - (lt.startedAt || 0) < seconds * 1000;
}

/** Millisecondes restantes avant la fin d'un lowerthird (Infinity si permanent). */
export function lowerthirdRemainingMs(lt, now = Date.now()) {
  if (!lt || lt.cut) return 0;
  const seconds = Number(lt.duration) || 0;
  if (!seconds) return Infinity;                 // 0 = affichage permanent
  return Math.max(0, seconds * 1000 - (now - (lt.startedAt || 0)));
}
