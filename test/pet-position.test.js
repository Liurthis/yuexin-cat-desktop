const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePetPosition, petBounds } = require('../src/pet-settings');

test('dragging at the screen edge converts negative zero to native-compatible positive zero', () => {
  for (const [x, y] of [[-0, -0], [-.4, -.1], [Math.round(-.25), 0]]) {
    const position = normalizePetPosition(x, y);
    assert.deepEqual(position, [0, 0]);
    assert.equal(Object.is(position[0], -0), false);
    assert.equal(Object.is(position[1], -0), false);
  }
});

test('dragging keeps fractional rounding and valid negative coordinates for other monitors', () => {
  assert.deepEqual(normalizePetPosition(-120.6, 310.4), [-121, 310]);
  assert.deepEqual(normalizePetPosition(-2147483648, 2147483647), [-2147483648, 2147483647]);
});

test('invalid or out-of-range drag coordinates are ignored rather than sent to Electron', () => {
  for (const [x, y] of [[NaN, 0], [0, Infinity], ['0', 1], [null, 1], [1e30, 1], [0, -2147483649], [2147483647.8, 0]]) {
    assert.equal(normalizePetPosition(x, y), null);
  }
});

test('scaling and startup bounds canonicalize negative zero on offset displays', () => {
  const bounds = petBounds(1.25, { x: 32, y: 70.6, width: 260, height: 285 }, { x: -500, y: -500, width: 1920, height: 1080 });
  assert.deepEqual(bounds, { width: 325, height: 356, x: 0, y: 0 });
  assert.equal(Object.is(bounds.x, -0), false);
  assert.equal(Object.is(bounds.y, -0), false);
  const initial = petBounds(1, null, { x: -0, y: -0, width: 150, height: 150 });
  assert.equal(Object.is(initial.x, -0), false);
  assert.equal(Object.is(initial.y, -0), false);
});

test('scaling preserves valid negative coordinates on left and upper displays', () => {
  const area = { x: -1920, y: -1080, width: 1920, height: 1080 };
  const bounds = petBounds(1.25, { x: -1000, y: -800, width: 260, height: 285 }, area);
  assert.deepEqual(bounds, { width: 325, height: 356, x: -1032, y: -871 });
  assert.ok(bounds.x >= area.x && bounds.x + bounds.width <= area.x + area.width);
  assert.ok(bounds.y >= area.y && bounds.y + bounds.height <= area.y + area.height);
  assert.deepEqual(normalizePetPosition(bounds.x, bounds.y), [bounds.x, bounds.y]);
});
