const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePetPosition } = require('../src/pet-settings');

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
