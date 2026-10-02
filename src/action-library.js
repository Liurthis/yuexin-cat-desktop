(function (root) {
  function chooseRandomAction(custom, builtins, previousId, random = Math.random) {
    const enabled = custom.filter((entry) => entry.random !== false);
    const pool = enabled.length ? enabled : builtins;
    const alternatives = pool.filter((entry) => entry.id !== previousId);
    const choices = alternatives.length ? alternatives : pool;
    return choices.length ? choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] : null;
  }
  function normalizeDuration(value) {
    const seconds = Number(value);
    return Math.round(Math.max(2, Math.min(120, Number.isFinite(seconds) && seconds > 0 ? seconds : 5)) * 1000);
  }
  function imageExtension(bytes) {
    const prefix = bytes.subarray(0, 12);
    if (['GIF87a', 'GIF89a'].includes(prefix.subarray(0, 6).toString())) return 'gif';
    if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
    if (prefix.subarray(0, 4).toString() === 'RIFF' && prefix.subarray(8, 12).toString() === 'WEBP') return 'webp';
    if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) return 'jpg';
    throw new Error('不是有效的 GIF、PNG、WebP 或 JPG 图片');
  }
  const api = { chooseRandomAction, normalizeDuration, imageExtension };
  if (typeof module !== 'undefined') module.exports = api;
  else root.YuexinLibrary = api;
})(globalThis);
