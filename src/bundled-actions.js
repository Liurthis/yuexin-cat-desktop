const fs = require('node:fs');
const path = require('node:path');
const { validCustomAction } = require('./pet-settings');

function seedBundledActions(state, sourceFolder, targetFolder) {
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceFolder, 'library.json'), 'utf8'));
  if (!Number.isInteger(manifest.version) || manifest.version < 1 || !Array.isArray(manifest.actions) || !manifest.actions.every(validCustomAction)) {
    throw new Error('内置动作库格式无效');
  }
  for (const entry of manifest.actions) {
    const sourceFile = entry.sourceFile || `${entry.id}.${entry.extension}`;
    if (typeof sourceFile !== 'string' || path.basename(sourceFile) !== sourceFile || /[\\/]/.test(sourceFile) || !sourceFile.endsWith('.' + entry.extension)) throw new Error('内置动作文件名无效');
    if (!fs.existsSync(path.join(sourceFolder, sourceFile))) throw new Error('内置动作文件缺失');
  }
  fs.mkdirSync(targetFolder, { recursive: true });
  let repaired = false;
  // Repair a missing referenced file without bringing back actions the user removed.
  if (state.bundledActionsVersion >= manifest.version) {
    for (const entry of manifest.actions) {
      if (!state.customActions.some((item) => item.id === entry.id)) continue;
      const filename = `${entry.id}.${entry.extension}`;
      if (!fs.existsSync(path.join(targetFolder, filename))) { fs.copyFileSync(path.join(sourceFolder, entry.sourceFile || filename), path.join(targetFolder, filename)); repaired = true; }
    }
    return repaired;
  }
  for (const entry of manifest.actions) {
    const filename = `${entry.id}.${entry.extension}`;
    const target = path.join(targetFolder, filename);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(sourceFolder, entry.sourceFile || filename), target);
    // Existing durations, random settings and original image bytes take priority.
    if (!state.customActions.some((item) => item.id === entry.id)) state.customActions.push({ ...entry });
  }
  // Remember the import so removing a bundled action remains effective.
  state.bundledActionsVersion = manifest.version;
  return true;
}

module.exports = { seedBundledActions };
