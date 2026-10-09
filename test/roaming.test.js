const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRoaming, createWalkPlan, createReturnPlan, sampleWalk } = require('../src/roaming');

const workArea = { x: 0, y: 40, width: 1280, height: 900 };
const bounds = { x: 600, y: 650, width: 260, height: 285 };
function samples(plan) {
  return Array.from({ length: 101 }, (_value, i) => sampleWalk(plan, plan.startedAt + plan.durationMs * i / 100));
}

test('roaming stays opt-in and normalizes unsupported settings', () => {
  const defaults = { enabled: false, intervalSeconds: 300, speed: 'normal' };
  for (const value of [undefined, null, {}, { enabled: 1, intervalSeconds: '180', speed: 'fast' }]) assert.deepEqual(normalizeRoaming(value), defaults);
  for (const intervalSeconds of [180, 300, 600]) assert.deepEqual(normalizeRoaming({ enabled: true, intervalSeconds, speed: 'slow' }), { enabled: true, intervalSeconds, speed: 'slow' });
});

test('walking moves a short horizontal distance and exactly returns home', () => {
  const plan = createWalkPlan(bounds, workArea, {}, 1000, () => .5);
  assert.deepEqual(plan.origin, { x: 600, y: 650 });
  assert.equal(plan.target.y, 650);
  assert.equal(Math.abs(plan.target.x - plan.origin.x), 105);
  assert.equal(plan.durationMs, 14000);
  assert.deepEqual(sampleWalk(plan, plan.startedAt), { x: 600, y: 650, direction: 1, done: false });
  assert.deepEqual(sampleWalk(plan, plan.startedAt + plan.durationMs / 2), { ...plan.target, direction: -1, done: false });
  assert.deepEqual(sampleWalk(plan, plan.startedAt + plan.durationMs), { ...plan.origin, direction: -1, done: true });
  assert.deepEqual(sampleWalk(JSON.parse(JSON.stringify(plan)), 1000000), { ...plan.origin, direction: -1, done: true });
  const path = samples(plan);
  assert.ok(path.every((point) => Number.isInteger(point.x) && point.y === bounds.y));
  assert.ok(path.slice(0, 51).every((point, i, leg) => i === 0 || point.x >= leg[i - 1].x));
  assert.ok(path.slice(50).every((point, i, leg) => i === 0 || point.x <= leg[i - 1].x));
  assert.equal(path[1].x, plan.origin.x);
  assert.equal(path[49].x, plan.target.x);
});

test('negative-coordinate displays and edge choices never cross a work area', () => {
  const area = { x: -1920, y: -1080, width: 1920, height: 1080 };
  for (const x of [-1920, -1100, -260]) {
    for (const randomValue of [0, .25, .999999, 1]) {
      const plan = createWalkPlan({ x, y: -285, width: 260, height: 285 }, area, {}, 0, () => randomValue);
      assert.ok(plan);
      assert.ok(Math.abs(plan.target.x - plan.origin.x) >= 50 && Math.abs(plan.target.x - plan.origin.x) <= 160);
      for (const point of samples(plan)) {
        assert.ok(point.x >= area.x && point.x + 260 <= area.x + area.width);
        assert.ok(point.y >= area.y && point.y + 285 <= area.y + area.height);
        assert.equal(Object.is(point.x, -0), false);
        assert.equal(Object.is(point.y, -0), false);
      }
    }
  }
});

test('small displays and oversized pets cannot produce an unsafe path', () => {
  const area = { x: 0, y: 0, width: 300, height: 300 };
  assert.equal(createWalkPlan({ x: 20, y: 0, width: 260, height: 285 }, area), null);
  assert.equal(createWalkPlan({ x: 0, y: 0, width: 301, height: 285 }, area), null);
  assert.equal(createWalkPlan({ x: 0, y: 0, width: 260, height: 301 }, area), null);
  const justEnough = createWalkPlan({ x: 0, y: 0, width: 250, height: 285 }, area, {}, 0, () => 1);
  assert.equal(justEnough.target.x, 50);
  assert.ok(samples(justEnough).every((point) => point.x >= 0 && point.x + 250 <= 300));
});

test('a misplaced pet is constrained to the selected screen and keeps its height when possible', () => {
  const plan = createWalkPlan({ ...bounds, x: -100, y: 2000 }, workArea, {}, 1, () => 0);
  assert.deepEqual(plan.origin, { x: 0, y: 655 });
  assert.deepEqual(plan.target, { x: 50, y: 655 });
  const fractional = createWalkPlan({ x: -.1, y: -.2, width: 100, height: 100 }, { x: -500, y: -100, width: 1000, height: 200 }, {}, 0, () => 0);
  assert.deepEqual(fractional.origin, { x: 0, y: 0 });
  assert.equal(Object.is(fractional.origin.x, -0), false);
  assert.equal(Object.is(fractional.origin.y, -0), false);
});

test('slow walks last longer and invalid random sources cannot escape distance limits', () => {
  for (const value of [0, .5, 1]) {
    const normal = createWalkPlan(bounds, workArea, { speed: 'normal' }, 0, () => value);
    const slow = createWalkPlan(bounds, workArea, { speed: 'slow' }, 0, () => value);
    assert.ok(normal.durationMs >= 10000 && normal.durationMs <= 18000);
    assert.ok(slow.durationMs >= 18000 && slow.durationMs <= 28000);
    assert.ok(slow.durationMs > normal.durationMs);
    assert.deepEqual(slow.target, normal.target);
  }
  for (const random of [null, () => -100, () => 100, () => NaN, () => { throw new Error('bad random'); }]) {
    const plan = createWalkPlan(bounds, workArea, null, 0, random);
    assert.ok(plan);
    assert.ok(Math.abs(plan.target.x - plan.origin.x) >= 50 && Math.abs(plan.target.x - plan.origin.x) <= 160);
  }
});

test('clock discontinuities and corrupted geometry are handled without native-invalid positions', () => {
  const plan = createWalkPlan(bounds, workArea, {}, 1000, () => 0);
  assert.deepEqual(sampleWalk(plan, -5000), sampleWalk(plan, 1000));
  assert.deepEqual(sampleWalk(plan, NaN), sampleWalk(plan, 1000));
  assert.equal(sampleWalk(plan, Number.MAX_VALUE).done, true);
  for (const rectangle of [null, {}, { ...bounds, x: NaN }, { ...bounds, width: 0 }, { ...bounds, height: Infinity }]) assert.equal(createWalkPlan(rectangle, workArea), null);
  assert.equal(createWalkPlan(bounds, { ...workArea, x: 2147483647 }), null);
  for (const corrupt of [null, {}, { ...plan, durationMs: 0 }, { ...plan, startedAt: NaN }, { ...plan, origin: { x: 1e30, y: 1 } }, { ...plan, target: { x: plan.target.x, y: plan.target.y + 1 } }]) assert.equal(sampleWalk(corrupt, 2000), null);
});

test('returning home takes one smooth leg and stops at home rather than walking back out', () => {
  for (const homeX of [500, 700]) {
    const plan = createReturnPlan(bounds, { x: homeX, y: bounds.y }, workArea, {}, 1000);
    const direction = homeX < bounds.x ? -1 : 1;
    assert.equal(plan.returnOnly, true);
    assert.deepEqual(plan.origin, { x: bounds.x, y: bounds.y });
    assert.deepEqual(plan.target, { x: homeX, y: bounds.y });
    const path = samples(plan);
    assert.deepEqual(path[0], { ...plan.origin, direction, done: false });
    assert.equal(path[50].x, (bounds.x + homeX) / 2);
    assert.deepEqual(path[100], { ...plan.target, direction, done: true });
    assert.deepEqual(sampleWalk(plan, plan.startedAt + plan.durationMs * 10), path[100]);
    assert.ok(path.every((point, i) => point.direction === direction && (i === 0 || (point.x - path[i - 1].x) * direction >= 0)));
    assert.equal(path[1].x, plan.origin.x);
  }
});

test('return plans clamp a home to the current display and support negative positions', () => {
  const area = { x: -1920, y: -1080, width: 1920, height: 1080 };
  const pet = { x: -600, y: -285, width: 260, height: 285 };
  const plan = createReturnPlan(pet, { x: 300, y: 100 }, area, {}, 0);
  assert.deepEqual(plan.origin, { x: -600, y: -285 });
  assert.deepEqual(plan.target, { x: -260, y: -285 });
  assert.ok(samples(plan).every((point) => point.x >= area.x && point.x + pet.width <= area.x + area.width && !Object.is(point.x, -0)));
  const acrossZero = createReturnPlan({ x: -80, y: -0, width: 100, height: 100 }, { x: -.1, y: -.1 }, { x: -500, y: -100, width: 1000, height: 200 }, {}, 0);
  assert.deepEqual(sampleWalk(acrossZero, 100000), { x: 0, y: 0, direction: 1, done: true });
  assert.equal(Object.is(acrossZero.target.x, -0), false);
  assert.equal(Object.is(acrossZero.target.y, -0), false);
});

test('return durations reflect speed within one to six seconds and reject vertical or impossible paths', () => {
  for (const distance of [1, 80, 500]) {
    const home = { x: bounds.x - distance, y: bounds.y };
    const normal = createReturnPlan(bounds, home, workArea, {}, 0);
    const slow = createReturnPlan(bounds, home, workArea, { speed: 'slow' }, 0);
    assert.ok(normal.durationMs >= 1000 && normal.durationMs <= 6000);
    assert.ok(slow.durationMs >= normal.durationMs && slow.durationMs <= 6000);
    if (distance === 80) assert.ok(slow.durationMs > normal.durationMs);
  }
  assert.equal(createReturnPlan(bounds, { x: 500, y: 500 }, workArea), null);
  assert.equal(createReturnPlan(bounds, { x: bounds.x, y: bounds.y }, workArea), null);
  assert.equal(createReturnPlan(bounds, { x: NaN, y: bounds.y }, workArea), null);
  assert.equal(createReturnPlan(bounds, { x: 500, y: bounds.y }, { ...workArea, width: 200 }), null);
  assert.equal(createReturnPlan({ ...bounds, width: Infinity }, { x: 500, y: bounds.y }, workArea), null);
});
