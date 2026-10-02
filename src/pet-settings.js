const BASE_WIDTH = 260;
const BASE_HEIGHT = 285;
function normalizeScale(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(.6, Math.min(1.8, number)) * 100) / 100 : 1;
}
function petBounds(scale, previous, workArea) {
  const width = Math.round(BASE_WIDTH * normalizeScale(scale));
  const height = Math.round(BASE_HEIGHT * normalizeScale(scale));
  const x = previous ? previous.x + (previous.width - width) / 2 : workArea.x + workArea.width - width - 25;
  const y = previous ? previous.y + previous.height - height : workArea.y + workArea.height - height - 25;
  return {
    width, height,
    x: Math.round(Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width))),
    y: Math.round(Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height))),
  };
}
function validCustomAction(action) {
  return action && /^[0-9a-f-]{36}$/.test(action.id) && /^(gif|png|webp|jpg)$/.test(action.extension) && typeof action.name === 'string' && Number.isFinite(action.duration);
}
module.exports = { normalizeScale, petBounds, validCustomAction };
