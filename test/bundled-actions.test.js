const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedBundledActions } = require('../src/bundled-actions');
const source = path.join(__dirname, '..', 'assets', 'actions');
const manifest = require('../assets/actions/library.json');

test('bundled GIFs keep their bytes and existing settings, and deleted actions stay deleted', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yuexin-actions-'));
  try {
    const existing = { ...manifest.actions[0], duration: 11000, random: false };
    const state = { customActions: [existing], bundledActionsVersion: 0 };
    assert.equal(seedBundledActions(state, source, folder), true);
    assert.equal(state.customActions.length, 8);
    assert.strictEqual(state.customActions[0], existing);
    assert.equal(existing.duration, 11000);
    assert.equal(existing.random, false);
    for (const entry of manifest.actions) {
      const filename = `${entry.id}.${entry.extension}`;
      assert.deepEqual(fs.readFileSync(path.join(folder, filename)), fs.readFileSync(path.join(source, entry.sourceFile || filename)));
    }
    state.customActions.pop();
    assert.equal(seedBundledActions(state, source, folder), false);
    assert.equal(state.customActions.length, 7);
    const missing = `${manifest.actions[0].id}.${manifest.actions[0].extension}`;
    fs.unlinkSync(path.join(folder, missing));
    assert.equal(seedBundledActions(state, source, folder), true, 'missing files still referenced by the library are repaired');
    assert.deepEqual(fs.readFileSync(path.join(folder, missing)), fs.readFileSync(path.join(source, manifest.actions[0].sourceFile || missing)));
    assert.equal(state.customActions.length, 7, 'repair does not restore deleted action entries');
    const fresh = { customActions: [], bundledActionsVersion: 0 };
    assert.equal(seedBundledActions(fresh, source, folder), true);
    assert.deepEqual(fresh.customActions, manifest.actions);
  } finally {
    const resolved = fs.realpathSync(folder);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    fs.rmSync(resolved, { recursive: true });
  }
});
