'use strict';

// ClaudeBridge's independent, fail-closed bootstrap model-list adapter.
// This file does NOT install a proxy or intercept TLS traffic.
// Only CLI-backed surfaces are eligible. Ordinary Claude Chat is deliberately untouched.
const CLI_SURFACES = new Set(['code','ccd','ccr','cowork']);
const BOOTSTRAP_PATHS = ['/edge-api/bootstrap','/api/bootstrap'];
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{1,127}$/;

function isBootstrapPath(pathname) {
  if (typeof pathname !== 'string') return false;
  return BOOTSTRAP_PATHS.some(path => pathname === path || pathname.startsWith(path + '?'));
}

function copyModel(model) { return JSON.parse(JSON.stringify(model)); }

function addBridgeModels(bootstrap, models) {
  if (!bootstrap || typeof bootstrap !== 'object' || Array.isArray(bootstrap)) {
    throw new TypeError('Expected a bootstrap object');
  }
  const result = {added: 0, surfaces: [], skipped: []};
  if (!Array.isArray(bootstrap.model_selector_config) || !Array.isArray(models)) return result;
  for (const surface of bootstrap.model_selector_config) {
    if (!surface || !CLI_SURFACES.has(surface.id) || !Array.isArray(surface.models)) continue;
    const family = surface.models.find(m => m && typeof m.id === 'string' &&
      /^claude-/.test(m.id) && !m.disabled && m.section !== 'deprecated');
    if (!family) { result.skipped.push(surface.id + ': no enabled native template'); continue; }
    const existing = new Set(surface.models.map(m => m?.id));
    const inserted = [];
    for (const candidate of models) {
      if (!candidate || typeof candidate !== 'object' ||
          !MODEL_ID.test(candidate.id || '') ||
          typeof candidate.name !== 'string' || !candidate.name.trim() ||
          candidate.name.length > 100) continue;
      if (existing.has(candidate.id)) continue;
      // Only advertise a model when the caller has a real route for it.
      if (candidate.routable !== true) {
        result.skipped.push(candidate.id + ': no verified route');
        continue;
      }
      const entry = copyModel(family);
      entry.id = candidate.id;
      entry.name = candidate.name.trim();
      entry.section = 'main';
      for (const key of ['disabled','disabled_reason','notice','selection_notice','is_default',
                         'minimum_tier','badge','badge_tooltip']) delete entry[key];
      if (typeof candidate.description === 'string') entry.description = candidate.description.slice(0,200);
      else delete entry.description;
      if (Number.isSafeInteger(candidate.contextWindow) && candidate.contextWindow > 0)
        entry.context_window = candidate.contextWindow;
      else delete entry.context_window;
      if (Array.isArray(candidate.effortLevels) && entry.thinking &&
          Array.isArray(entry.thinking.effort_options)) {
        const valid = new Set(candidate.effortLevels);
        const kept = entry.thinking.effort_options.filter(o => valid.has(o.id));
        if (kept.length === 0) delete entry.thinking;
        else entry.thinking.effort_options = kept.map((o, i) => ({...o, recommended: i===0}));
      }
      surface.models.push(entry);
      inserted.push(candidate.id);
      existing.add(candidate.id);
      result.added++;
    }
    result.surfaces.push({id: surface.id, inserted});
  }
  return result;
}

module.exports = {addBridgeModels, isBootstrapPath, CLI_SURFACES};
