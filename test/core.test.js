const test = require('node:test');
const assert = require('node:assert/strict');
const { nextDailyTime, advanceDaily, normalizeLimits } = require('../src/core');

test('daily reminder chooses the next local occurrence', () => {
  const now = new Date(2026, 9, 2, 9, 30);
  assert.equal(new Date(nextDailyTime('10:00', now)).getDate(), 2);
  assert.equal(new Date(nextDailyTime('09:00', now)).getDate(), 3);
  assert.equal(new Date(advanceDaily(new Date(2026, 9, 1, 9, 0).getTime(), now.getTime())).getDate(), 3);
});

test('usage windows report remaining percentage and reset time', () => {
  const buckets = normalizeLimits({ rateLimitsByLimitId: { codex: {
    limitId: 'codex', primary: { usedPercent: 8.4, windowDurationMins: 300, resetsAt: 123 },
    secondary: { usedPercent: 2, windowDurationMins: 10080, resetsAt: 456 },
  } } });
  assert.equal(buckets[0].windows[0].remainingPercent, 92);
  assert.equal(buckets[0].windows[1].remainingPercent, 98);
  assert.equal(buckets[0].windows[0].resetsAt, 123);
});
