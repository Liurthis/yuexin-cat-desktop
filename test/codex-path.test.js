const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { resolveCodexPath } = require('../src/codex-path');

test('desktop launch finds the installed Codex executable with an empty PATH', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yuexin-codex-path-'));
  try {
    const root = path.join(folder, 'OpenAI', 'Codex', 'bin');
    fs.mkdirSync(path.join(root, 'new-version'), { recursive: true });
    fs.mkdirSync(path.join(root, 'rg-only-version'), { recursive: true });
    const cli = path.join(root, 'new-version', 'codex.exe');
    fs.writeFileSync(cli, 'test executable');
    assert.equal(resolveCodexPath(null, { LOCALAPPDATA: folder, PATH: '' }), cli);
    assert.throws(() => resolveCodexPath(path.join(folder, 'missing.exe'), { LOCALAPPDATA: folder, PATH: '' }), /路径已失效/);
  } finally {
    const target = fs.realpathSync(folder);
    if (path.dirname(target) !== fs.realpathSync(os.tmpdir()) || !path.basename(target).startsWith('yuexin-codex-path-')) throw new Error('Refusing to remove a directory outside the test temporary folder');
    fs.rmSync(target, { recursive: true, force: true });
  }
});
