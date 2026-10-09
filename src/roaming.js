const { normalizePetPosition } = require('./pet-settings');

const MIN_DISTANCE = 50;
const MAX_DISTANCE = 160;

function normalizeRoaming(value) {
  return {
    enabled: value?.enabled === true,
    intervalSeconds: [180, 300, 600].includes(value?.intervalSeconds) ? value.intervalSeconds : 300,
    speed: value?.speed === 'slow' ? 'slow' : 'normal',
  };
}

function validRectangle(value) {
  return value && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])) && value.width > 0 && value.height > 0;
}

function randomUnit(random) {
  try {
    const value = typeof random === 'function' ? random() : .5;
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .5;
  } catch {
    return .5;
  }
}

function createWalkPlan(bounds, workArea, options = {}, now = Date.now(), random = Math.random) {
  if (!validRectangle(bounds) || !validRectangle(workArea)) return null;
  // Integer window positions must keep the whole pet inside the current display.
  const minX = Math.ceil(workArea.x);
  const maxX = Math.floor(workArea.x + workArea.width - bounds.width);
  const minY = Math.ceil(workArea.y);
  const maxY = Math.floor(workArea.y + workArea.height - bounds.height);
  if (minX > maxX || minY > maxY || !normalizePetPosition(minX, minY) || !normalizePetPosition(maxX, maxY)) return null;
  const position = normalizePetPosition(Math.max(minX, Math.min(bounds.x, maxX)), Math.max(minY, Math.min(bounds.y, maxY)));
  if (!position) return null;
  const origin = { x: position[0], y: position[1] };
  const directions = [];
  if (origin.x - minX >= MIN_DISTANCE) directions.push(-1);
  if (maxX - origin.x >= MIN_DISTANCE) directions.push(1);
  if (!directions.length) return null;
  const direction = directions[Math.min(directions.length - 1, Math.floor(randomUnit(random) * directions.length))];
  const available = direction < 0 ? origin.x - minX : maxX - origin.x;
  const distance = Math.round(MIN_DISTANCE + randomUnit(random) * (Math.min(MAX_DISTANCE, available) - MIN_DISTANCE));
  const targetPosition = normalizePetPosition(origin.x + direction * distance, origin.y);
  if (!targetPosition) return null;
  const slow = normalizeRoaming(options).speed === 'slow';
  const durationMs = Math.round((slow ? 18000 : 10000) + randomUnit(random) * (slow ? 10000 : 8000));
  return {
    origin,
    target: { x: targetPosition[0], y: targetPosition[1] },
    startedAt: Number.isFinite(now) ? now : Date.now(),
    durationMs,
  };
}

function createReturnPlan(bounds, home, workArea, options = {}, now = Date.now()) {
  if (!validRectangle(bounds) || !validRectangle(workArea) || !Number.isFinite(home?.x) || !Number.isFinite(home?.y)) return null;
  const minX = Math.ceil(workArea.x);
  const maxX = Math.floor(workArea.x + workArea.width - bounds.width);
  const minY = Math.ceil(workArea.y);
  const maxY = Math.floor(workArea.y + workArea.height - bounds.height);
  if (minX > maxX || minY > maxY || !normalizePetPosition(minX, minY) || !normalizePetPosition(maxX, maxY)) return null;
  const origin = normalizePetPosition(Math.max(minX, Math.min(bounds.x, maxX)), Math.max(minY, Math.min(bounds.y, maxY)));
  const target = normalizePetPosition(Math.max(minX, Math.min(home.x, maxX)), Math.max(minY, Math.min(home.y, maxY)));
  // Vertical relocations are handled by the caller, rather than sliding a pet diagonally.
  if (!origin || !target || origin[1] !== target[1] || origin[0] === target[0]) return null;
  const distance = Math.abs(target[0] - origin[0]);
  const speed = normalizeRoaming(options).speed === 'slow' ? 22 : 40;
  return {
    origin: { x: origin[0], y: origin[1] },
    target: { x: target[0], y: target[1] },
    startedAt: Number.isFinite(now) ? now : Date.now(),
    durationMs: Math.round(Math.max(1000, Math.min(6000, distance / speed * 1000))),
    returnOnly: true,
  };
}

function sampleWalk(plan, now = Date.now()) {
  const origin = normalizePetPosition(plan?.origin?.x, plan?.origin?.y);
  const target = normalizePetPosition(plan?.target?.x, plan?.target?.y);
  if (!origin || !target || origin[1] !== target[1] || origin[0] === target[0] || !Number.isFinite(plan?.startedAt) || !Number.isFinite(plan?.durationMs) || plan.durationMs <= 0) return null;
  const elapsed = Number.isFinite(now) ? Math.max(0, now - plan.startedAt) : 0;
  const progress = Math.min(1, elapsed / plan.durationMs);
  const outwardDirection = target[0] > origin[0] ? 1 : -1;
  const returnOnly = plan.returnOnly === true;
  const direction = returnOnly || progress < .5 ? outwardDirection : -outwardDirection;
  if (progress >= 1) {
    const destination = returnOnly ? target : origin;
    return { x: destination[0], y: destination[1], direction, done: true };
  }
  // Ease in and out on each leg, so turning around does not snap the pet.
  const legProgress = returnOnly ? progress : progress < .5 ? progress * 2 : (1 - progress) * 2;
  const eased = (1 - Math.cos(Math.PI * legProgress)) / 2;
  const position = normalizePetPosition(origin[0] + (target[0] - origin[0]) * eased, origin[1]);
  return position ? { x: position[0], y: position[1], direction, done: false } : null;
}

module.exports = { normalizeRoaming, createWalkPlan, createReturnPlan, sampleWalk };
