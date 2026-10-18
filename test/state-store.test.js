const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStateStore } = require('../src/state-store');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yuexin-state-'));
  const file = path.join(directory, 'profile', 'state.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const put = (suffix, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + suffix, text, 'utf8');
  };
  const corruptFiles = () => fs.readdirSync(path.dirname(file)).filter((name) => name.includes('.corrupt-'));
  return { file, put, corruptFiles, store: createStateStore(file) };
}

test('a missing profile can be created, and each successful save backs up the previous object', (t) => {
  const { file, store } = fixture(t);
  assert.deepEqual(store.read(), { state: null, recovered: false });
  const first = { petName: '小月亮', customActions: [{ id: 'icecream' }], journal: { days: [1] } };
  store.write(first);
  assert.deepEqual(store.read(), { state: first, recovered: false });
  assert.equal(fs.existsSync(`${file}.bak`), false);
  const second = { ...first, petName: '月薪喵' };
  store.write(second);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), first);
  assert.deepEqual(store.read(), { state: second, recovered: false });
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test('a valid main file wins over an older backup and an uncommitted temporary file', (t) => {
  const { put, store } = fixture(t);
  put('', '\uFEFF{"revision":3}');
  put('.bak', '{"revision":1}');
  put('.tmp', '{"revision":4}');
  assert.deepEqual(store.read(), { state: { revision: 3 }, recovered: false });
});

test('a corrupt main file is isolated and restored from its backup without replacing that backup', (t) => {
  const { file, put, corruptFiles, store } = fixture(t);
  const damaged = '{"customActions":[';
  const backup = '\uFEFF{"customActions":[{"id":"kept"}],"journal":{"days":[1]}}';
  put('', damaged);
  put('.bak', backup);
  put('.tmp', '{"uncommitted":true}');
  const result = store.read();
  assert.equal(result.recovered, true);
  assert.deepEqual(result.state.customActions, [{ id: 'kept' }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), result.state);
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), backup);
  const saved = corruptFiles();
  assert.equal(saved.length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(file), saved[0]), 'utf8'), damaged);
  assert.deepEqual(store.read(), { state: result.state, recovered: false });
});

test('a missing main file can recover from its backup or a completed temporary file', (t) => {
  const { file, put, store } = fixture(t);
  put('.bak', '{"source":"backup"}');
  assert.deepEqual(store.read(), { state: { source: 'backup' }, recovered: true });
  fs.unlinkSync(file);
  fs.unlinkSync(`${file}.bak`);
  put('.tmp', '\uFEFF{"source":"temporary"}');
  assert.deepEqual(store.read(), { state: { source: 'temporary' }, recovered: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { source: 'temporary' });
});

test('invalid objects are preserved instead of being accepted as state', (t) => {
  for (const text of ['null', '[]', '42', 'true', '"text"', '', '{broken']) {
    const { file, put, corruptFiles, store } = fixture(t);
    put('', text);
    put('.bak', '[]');
    put('.tmp', 'null');
    assert.deepEqual(store.read(), { state: null, recovered: false });
    assert.equal(corruptFiles().length, 3);
    assert.equal(fs.existsSync(file), false);
    store.write({ valid: true });
    assert.deepEqual(store.read(), { state: { valid: true }, recovered: false });
  }
});

test('writing over a corrupt primary preserves both the corrupt bytes and the usable backup', (t) => {
  const { file, put, corruptFiles, store } = fixture(t);
  put('', 'broken primary');
  put('.bak', '{"old":true}');
  store.write({ current: true });
  assert.deepEqual(store.read().state, { current: true });
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), '{"old":true}');
  assert.equal(corruptFiles().length, 1);
});

test('serialization failures leave the previous main and backup untouched', (t) => {
  const { file, store } = fixture(t);
  store.write({ revision: 1 });
  store.write({ revision: 2 });
  const circular = {}; circular.self = circular;
  for (const invalid of [null, [], 3, 'text', { toJSON: () => null }, { number: 1n }, circular]) {
    assert.throws(() => store.write(invalid));
  }
  assert.deepEqual(store.read().state, { revision: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { revision: 1 });
});

test('a failed final rename keeps the previous main readable and a valid backup', (t) => {
  const { file, store } = fixture(t);
  store.write({ revision: 1 });
  const rename = fs.renameSync;
  const mocked = t.mock.method(fs, 'renameSync', (source, destination) => {
    if (source === `${file}.tmp` && destination === file) {
      throw Object.assign(new Error('locked file'), { code: 'EACCES' });
    }
    return rename(source, destination);
  });
  assert.throws(() => store.write({ revision: 2 }), /locked file/);
  mocked.mock.restore();
  assert.deepEqual(store.read(), { state: { revision: 1 }, recovered: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { revision: 1 });
});

test('a failed backup replacement leaves the previous backup and main unchanged', (t) => {
  const { file, store } = fixture(t);
  store.write({ revision: 1 });
  store.write({ revision: 2 });
  const rename = fs.renameSync;
  const mocked = t.mock.method(fs, 'renameSync', (source, destination) => {
    if (destination === `${file}.bak`) throw new Error('backup locked');
    return rename(source, destination);
  });
  assert.throws(() => store.write({ revision: 3 }), /backup locked/);
  mocked.mock.restore();
  assert.deepEqual(store.read().state, { revision: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { revision: 1 });
});

test('a failed temporary write leaves both valid state files untouched', (t) => {
  const { file, store } = fixture(t);
  store.write({ revision: 1 });
  store.write({ revision: 2 });
  fs.mkdirSync(`${file}.tmp`);
  assert.throws(() => store.write({ revision: 3 }));
  assert.deepEqual(store.read().state, { revision: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { revision: 1 });
});

test('read IO errors are reported instead of being mistaken for a missing profile', (t) => {
  const { file, store } = fixture(t);
  fs.mkdirSync(file, { recursive: true });
  assert.throws(() => store.read());
});

test('a corrupt backup is isolated before recovering a completed temporary file', (t) => {
  const { put, corruptFiles, store } = fixture(t);
  put('', 'broken main');
  put('.bak', 'broken backup');
  put('.tmp', '{"restored":true}');
  assert.deepEqual(store.read(), { state: { restored: true }, recovered: true });
  assert.equal(corruptFiles().length, 2);
});
