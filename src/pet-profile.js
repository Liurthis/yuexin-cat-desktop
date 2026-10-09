const DEFAULT_NAME = '月薪喵';
function normalizePetName(value) {
  if (typeof value !== 'string') return DEFAULT_NAME;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return Array.from(cleaned).slice(0, 12).join('') || DEFAULT_NAME;
}
module.exports = { DEFAULT_NAME, normalizePetName };
