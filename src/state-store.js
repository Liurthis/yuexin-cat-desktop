const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function isState(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readCandidate(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { exists: false, valid: false };
    throw error;
  }
  try {
    const value = JSON.parse(text.replace(/^\uFEFF/, ''));
    return { exists: true, valid: isState(value), value, text };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { exists: true, valid: false };
  }
}

function preserveCorrupt(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(file, `${file}.corrupt-${stamp}-${randomUUID()}`);
}

function writeDurable(file, text) {
  const descriptor = fs.openSync(file, 'w', 0o600);
  try {
    fs.writeFileSync(descriptor, text, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function createStateStore(file) {
  const backup = `${file}.bak`;
  const temporary = `${file}.tmp`;

  function write(value) {
    if (!isState(value)) throw new TypeError('状态必须是 JSON 对象');
    const text = JSON.stringify(value, null, 2);
    if (typeof text !== 'string' || !isState(JSON.parse(text))) {
      throw new TypeError('状态必须能保存为 JSON 对象');
    }

    fs.mkdirSync(path.dirname(file), { recursive: true });
    const current = readCandidate(file);
    // Finish the new file before touching the last known good state or backup.
    writeDurable(temporary, text);
    if (current.valid) {
      const backupTemporary = `${backup}.tmp`;
      writeDurable(backupTemporary, current.text);
      fs.renameSync(backupTemporary, backup);
    } else if (current.exists) {
      preserveCorrupt(file);
    }
    fs.renameSync(temporary, file);
  }

  function read() {
    const current = readCandidate(file);
    if (current.valid) return { state: current.value, recovered: false };
    if (current.exists) preserveCorrupt(file);

    for (const candidate of [backup, temporary]) {
      const result = readCandidate(candidate);
      if (result.valid) {
        // The corrupt primary has already been isolated, so writing the recovery
        // cannot replace the usable backup with corrupt data.
        write(result.value);
        return { state: result.value, recovered: true };
      }
      if (result.exists) preserveCorrupt(candidate);
    }
    return { state: null, recovered: false };
  }

  return { read, write };
}

module.exports = { createStateStore };
