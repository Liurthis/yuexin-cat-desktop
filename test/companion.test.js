const test = require('node:test');
const assert = require('node:assert/strict');
const { HOUR, BOND_DAILY_LIMIT, normalizeCompanion, advanceCompanion, companionView, interactCompanion, setSleeping } = require('../src/companion');
const { createPettingGesture } = require('../src/petting-gesture');
const start = new Date(2026, 9, 4, 9, 0).getTime();

test('old profiles migrate, invalid values are clamped, and affectionate interactions respect cooldowns', () => {
  const cat = normalizeCompanion(undefined, start);
  assert.equal(cat.mood, 75);
  assert.equal(cat.bond, 0);
  const first = interactCompanion(cat, 'petting', 70, start);
  assert.equal(first.moodGained, 5);
  assert.equal(cat.daysTogether, 1);
  assert.equal(cat.bond, 5, 'first visit and first task grant their bonuses once');
  assert.throws(() => interactCompanion(cat, 'petting', 70, start + 11999), /等一小会儿/);
  assert.equal(cat.bond, 5);
  interactCompanion(cat, 'petting', 70, start + 12000);
  assert.equal(cat.bond, 7);
  assert.equal(cat.daysTogether, 1);
  assert.throws(() => interactCompanion(cat, 'invalid', 70, start), /暂时/);
  const bad = normalizeCompanion({ mood: -1, bond: 999999, daily: { date: companionView(cat, start).daily.date, bondGained: 99 } }, start);
  assert.equal(bad.mood, 0); assert.equal(bad.bond, 1000); assert.equal(bad.daily.bondGained, BOND_DAILY_LIMIT);
});

test('favorite foods, three daily tasks, level rewards and the daily bond cap persist across restarts', () => {
  const cat = normalizeCompanion({ mood: 40, bond: 45 }, start);
  const favorite = companionView(cat, start).favoriteFood;
  const feeding = interactCompanion(cat, 'feed', 60, start, favorite);
  assert.equal(feeding.favorite, true);
  assert.equal(feeding.moodGained, favorite === 'snack' ? 10 : 7);
  assert.equal(feeding.levelUp, true);
  interactCompanion(cat, 'petting', 70, start + 1);
  const play = interactCompanion(cat, 'play', 70, start + 2);
  assert.equal(play.completed, true);
  assert.equal(play.moodGained, 13);
  const restored = normalizeCompanion(JSON.parse(JSON.stringify(cat)), start + 3);
  assert.equal(restored.daily.rewarded, true);
  assert.equal(companionView(restored, start).level.name, '熟悉');
  for (let index = 1; index <= 30; index++) interactCompanion(restored, 'feed', 70, start + index * 100, 'fish');
  assert.equal(restored.bond, 45 + BOND_DAILY_LIMIT);
  assert.equal(restored.mood, 100);
  const tomorrow = start + 24 * HOUR;
  const before = restored.bond;
  const next = interactCompanion(restored, 'petting', 70, tomorrow);
  assert.equal(next.bondGained, 5);
  assert.equal(restored.bond, before + 5);
  assert.equal(restored.daysTogether, 2);
  assert.equal(restored.daily.feed, false);
  assert.equal(restored.daily.rewarded, false);
});

test('mood changes gently offline, keeps partial hours, and sleep restores mood without losing affection', () => {
  const cat = normalizeCompanion({ mood: 90, bond: 200 }, start);
  assert.equal(advanceCompanion(cat, 70, start + HOUR - 1), false);
  advanceCompanion(cat, 70, start + HOUR + 30000);
  assert.equal(cat.mood, 88);
  const restored = normalizeCompanion(JSON.parse(JSON.stringify(cat)), start + 2 * HOUR);
  advanceCompanion(restored, 70, start + 2 * HOUR);
  assert.equal(restored.mood, 86);
  advanceCompanion(restored, 0, start + 100 * HOUR);
  assert.equal(restored.mood, 70, 'a long absence is capped to eight hours per update');
  assert.equal(restored.bond, 200);
  assert.equal(advanceCompanion(restored, 0, start + 100 * HOUR), false);
  setSleeping(restored, true, 70, start + 100 * HOUR + 1000);
  assert.throws(() => interactCompanion(restored, 'petting', 70, start + 100 * HOUR + 1001), /先叫它起床/);
  advanceCompanion(restored, 70, start + 103 * HOUR + 1000);
  assert.equal(restored.mood, 76);
  assert.equal(companionView(restored, start + 103 * HOUR + 1000).emotion.name, '睡觉中');
  interactCompanion(restored, 'feed', 70, start + 103 * HOUR + 1000, 'snack');
  assert.equal(restored.sleeping, false, 'feeding wakes the cat');
});

test('head strokes need deliberate reversals; clicks, dragging, body motion and jitter are not petting', () => {
  const gesture = createPettingGesture();
  assert.equal(gesture.move(.3, .25, false, start), false);
  assert.equal(gesture.move(.65, .25, false, start + 200), false);
  assert.equal(gesture.move(.32, .25, false, start + 400), false);
  assert.equal(gesture.move(.66, .25, false, start + 600), true);
  for (let index = 0; index < 30; index++) assert.equal(gesture.move(.5 + (index % 2) * .003, .25, false, start + 1000 + index * 20), false);
  assert.equal(gesture.move(.3, .25, true, start + 2000), false);
  assert.equal(gesture.move(.65, .25, true, start + 2200), false);
  assert.equal(gesture.move(.3, .8, false, start + 2400), false);
  assert.equal(gesture.move(.65, .8, false, start + 2600), false);
  assert.equal(gesture.move(.3, .25, false, start + 9000), false);
});
