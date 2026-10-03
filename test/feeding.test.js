const test = require('node:test');
const assert = require('node:assert/strict');
const { DECAY_INTERVAL, normalizeFeeding, advanceSatiety, feedPet } = require('../src/feeding');

test('satiety stays within 0–100, supports all foods and refuses a full bowl', () => {
  const now = 1000000;
  const feeding = normalizeFeeding(undefined, now);
  assert.equal(feeding.satiety, 70);
  assert.equal(feedPet(feeding, 'snack', now).gained, 10);
  assert.equal(feedPet(feeding, 'fish', now).satiety, 100);
  assert.throws(() => feedPet(feeding, 'can', now), /已经饱饱/);
  feeding.satiety = 90;
  assert.equal(feedPet(feeding, 'can', now).gained, 10);
  assert.throws(() => feedPet(feeding, 'invalid', now), /请选择/);
  assert.equal(normalizeFeeding({ satiety: -50 }, now).satiety, 0);
  assert.equal(normalizeFeeding({ satiety: 999 }, now).satiety, 100);
  assert.equal(normalizeFeeding({ satiety: NaN }, now).satiety, 70);
});

test('satiety accounts for offline time and saved partial intervals without underflow', () => {
  const start = 1000000;
  const feeding = normalizeFeeding({ satiety: 5, updatedAt: start }, start);
  assert.equal(advanceSatiety(feeding, start + DECAY_INTERVAL - 1), false);
  assert.equal(advanceSatiety(feeding, start + DECAY_INTERVAL + 500), true);
  assert.equal(feeding.satiety, 4);
  const restored = normalizeFeeding(JSON.parse(JSON.stringify(feeding)), start + DECAY_INTERVAL * 3);
  advanceSatiety(restored, start + DECAY_INTERVAL * 3);
  assert.equal(restored.satiety, 2);
  advanceSatiety(restored, start + DECAY_INTERVAL * 50);
  assert.equal(restored.satiety, 0);
  assert.equal(feedPet(restored, 'fish', start + DECAY_INTERVAL * 50).satiety, 20);
  assert.equal(advanceSatiety(restored, start + DECAY_INTERVAL * 50 + 1), false);
  assert.equal(advanceSatiety(restored, start), true);
  assert.equal(restored.satiety, 20);
});
