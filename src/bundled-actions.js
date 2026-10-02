const fs = require('node:fs');
const path = require('node:path');
const { validCustomAction } = require('./pet-settings');

function seedBundledActions(state, sourceFolder, targetFolder) {
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceFolder, 'library.json'), 'utf8'));
  if (state.bundledActionsVersion >= manifest.version) return false;
  if (!Number.isInteger(manifest.version) || manifest.version < 1 || !Array.isArray(manifest.actions) || !manifest.actions.every(validCustomAction)) {
    throw new Error('内置动作库格式无效');
  }
  for (const entry of manifest.actions) {
    if (!fs.existsSync(path.join(sourceFolder, `${entry.id}.${entry.extension}`))) throw new Error('内置动作文件缺失');
  }
  fs.mkdirSync(targetFolder, { recursive: true });
  for (const entry of manifest.actions) {
    const filename = `${entry.id}.${entry.extension}`;
    const target = path.join(targetFolder, filename);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(sourceFolder, filename), target);
    // Existing durations, random settings and original image bytes take priority.
    if (!state.customActions.some((item) => item.id === entry.id)) state.customActions.push({ ...entry });
  }
  // Remember the import so removing a bundled action remains effective.
  state.bundledActionsVersion = manifest.version;
  return true;
}

module.exports = { seedBundledActions };
