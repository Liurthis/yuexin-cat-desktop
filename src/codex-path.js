const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function resolveCodexPath(configured, env = process.env) {
  const exists = (candidate) => { try { return fs.statSync(candidate).isFile(); } catch { return false; } };
  const explicit = configured || env.CODEX_CLI_PATH;
  if (explicit) {
    const candidate = String(explicit).trim().replace(/^"|"$/g, '');
    if (exists(candidate) && /\.exe$/i.test(candidate)) return candidate;
    throw new Error('设置的 Codex 程序路径已失效，请在额度页重新选择 codex.exe');
  }
  const envPath = env.PATH || env.Path || '';
  for (const folder of envPath.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(folder.replace(/^"|"$/g, ''), 'codex.exe');
    if (exists(candidate)) return candidate;
  }
  // The desktop app's private CLI is available even when Explorer has an old PATH.
  const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const root = path.join(local, 'OpenAI', 'Codex', 'bin');
  if (exists(path.join(root, 'codex.exe'))) return path.join(root, 'codex.exe');
  try {
    const candidates = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, 'codex.exe'))
      .filter(exists)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (candidates.length) return candidates[0];
  } catch {}
  throw new Error('没有找到 Codex 程序。请在额度页点“选择 Codex 程序”，选择已安装的 codex.exe');
}
module.exports = { resolveCodexPath };
