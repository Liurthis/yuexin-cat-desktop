const test = require('node:test');
const assert = require('node:assert/strict');
const { MINUTE, normalizeFocus, startFocus, tickFocus, toggleFocus, focusView } = require('../src/focus');
const { normalizeJournal, recordJournal, journalView, journalText, RETAIN_DAYS } = require('../src/journal');
const { normalizeCompanion, rewardFocus, BOND_DAILY_LIMIT } = require('../src/companion');
const { normalizeTags, chooseForTag, contextTag } = require('../src/action-context');
const start = new Date(2026, 9, 4, 9).getTime();

test('focus ignores paused and offline time, resumes the same session, and completes each phase once', () => {
  const focus = normalizeFocus(undefined, start);
  startFocus(focus, { minutes: 2, breakMinutes: 1 }, start, 'session');
  assert.throws(() => startFocus(focus), /还没结束/);
  tickFocus(focus, start + 30000);
  assert.equal(focus.session.remainingMs, 90000);
  toggleFocus(focus, start + 30000);
  tickFocus(focus, start + 10 * MINUTE);
  assert.equal(focus.session.remainingMs, 90000);
  const restored = normalizeFocus(JSON.parse(JSON.stringify(focus)), start + 60 * MINUTE);
  assert.equal(restored.session.status, 'paused');
  assert.equal(focusView(restored).session.endsAt, null);
  toggleFocus(restored, start + 60 * MINUTE);
  const completion = tickFocus(restored, start + 62 * MINUTE);
  assert.equal(completion.event.kind, 'focus');
  assert.equal(completion.event.minutes, 2);
  assert.equal(restored.session.phase, 'break');
  assert.equal(restored.session.remainingMs, MINUTE, 'overshoot does not silently skip the break');
  assert.equal(tickFocus(restored, start + 62 * MINUTE).event, undefined);
  assert.equal(tickFocus(restored, start + 63 * MINUTE).event.kind, 'break');
  assert.equal(restored.session, null);
  assert.equal(tickFocus(restored, start + 64 * MINUTE).event, undefined);
});

test('running sessions reopen paused, invalid settings and remaining time stay bounded', () => {
  const focus = normalizeFocus({ settings: { minutes: -10, breakMinutes: 500 }, session: { id: 'valid', phase: 'focus', status: 'running', durationMs: 5, remainingMs: 999999, breakMs: NaN } }, start);
  assert.equal(focus.settings.minutes, 1);
  assert.equal(focus.settings.breakMinutes, 30);
  assert.equal(focus.session.remainingMs, MINUTE);
  assert.equal(focus.session.status, 'paused');
  assert.equal(normalizeFocus({ session: { phase: 'invalid' } }).session, null);
  const fresh = normalizeFocus(undefined, start);
  startFocus(fresh, { minutes: 999, breakMinutes: 0 }, start);
  assert.equal(fresh.session.durationMs, 180 * MINUTE);
  assert.equal(fresh.session.breakMs, MINUTE);
});

test('completed focus rewards affection under the existing daily cap without completing daily toys or feeding', () => {
  const cat = normalizeCompanion({ mood: 50 }, start);
  assert.deepEqual(rewardFocus(cat, 70, start), { moodGained: 3, bondGained: 4 });
  assert.equal(cat.daysTogether, 1);
  assert.equal(cat.daily.feed, false);
  assert.equal(cat.daily.play, false);
  for (let i = 1; i <= 20; i++) rewardFocus(cat, 70, start + i * MINUTE);
  assert.equal(cat.bond, BOND_DAILY_LIMIT);
  assert.equal(cat.mood, 100);
  assert.deepEqual(rewardFocus(cat, 70, start + 21 * MINUTE), { moodGained: 0, bondGained: 0 });
});

test('journal keeps real interaction counts, earned badges and minutes after serialization and pruning', () => {
  let journal = normalizeJournal();
  const cat = normalizeCompanion({ mood: 80, bond: 60, daysTogether: 7 }, start);
  recordJournal(journal, 'feed', { foodId: 'snack', favorite: true }, cat, start);
  recordJournal(journal, 'petting', {}, cat, start + 1);
  recordJournal(journal, 'play', { completed: true, levelUp: true }, cat, start + 2);
  recordJournal(journal, 'focus', { minutes: 100 }, cat, start + 3);
  journal = normalizeJournal(JSON.parse(JSON.stringify(journal)));
  assert.equal(journalView(journal).badges.filter((badge) => badge.earnedAt).length, 6);
  assert.equal(journal.days[0].foods.snack, 1);
  assert.equal(journal.days[0].focusMinutes, 100);
  assert.match(journalText(journal), /今天最爱的口味/);
  assert.match(journalText(journal), /100 分钟专注/);
  for (let day = 1; day <= 100; day++) {
    recordJournal(journal, 'feed', { foodId: 'fish' }, cat, start + day * 24 * 60 * MINUTE);
    journal = normalizeJournal(JSON.parse(JSON.stringify(journal)));
  }
  assert.equal(journal.days.length, RETAIN_DAYS);
  assert.equal(journal.totals.feed, 101, 'all-time totals survive day pruning');
  assert.equal(journal.badges.length, 6, 'badges are only awarded once');
  for (let i = 0; i < 50; i++) recordJournal(journal, 'petting', {}, cat, start + 100 * 24 * 60 * MINUTE + i);
  assert.equal(journal.days[0].entries.length, 40);
  assert.equal(journal.days[0].petting, 50, 'entry retention does not truncate daily counts');
});

test('state tags migrate the existing GIFs, honor explicit empty tags and exclude disabled actions', () => {
  assert.deepEqual(normalizeTags({ name: '困困' }), ['sleep']);
  assert.deepEqual(normalizeTags({ name: '你好' }), ['greeting']);
  assert.deepEqual(normalizeTags({ name: '喜欢' }), ['happy', 'celebrate']);
  assert.deepEqual(normalizeTags({ name: 'eatting icecream' }), ['hungry']);
  assert.deepEqual(normalizeTags({ name: '爱你', tags: [] }), []);
  assert.deepEqual(normalizeTags({ tags: ['focus', 'focus', 'unknown'] }), ['focus']);
  const entries = [{ id: 'a', tags: ['happy'] }, { id: 'b', tags: ['happy'] }, { id: 'c', tags: ['happy'], random: false }];
  assert.equal(chooseForTag(entries, 'happy', 'a', () => 0).id, 'b');
  assert.equal(chooseForTag(entries, 'hungry', null), null);
  assert.equal(contextTag({ feeding: { satiety: 20 }, companion: { mood: 100 } }, 9), 'hungry');
  assert.equal(contextTag({ companion: { mood: 90 } }, 9), 'happy');
  assert.equal(contextTag({}, 23), 'sleep');
  assert.equal(contextTag({ focus: { session: { phase: 'focus', status: 'running' } } }, 23), 'focus');
  assert.equal(contextTag({ companion: { sleeping: true }, focus: { session: { phase: 'focus', status: 'running' } } }, 9), 'sleep');
});
