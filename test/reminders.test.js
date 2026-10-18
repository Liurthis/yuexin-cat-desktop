const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_HISTORY, normalizeReminders, normalizeReminderInbox, collectDueReminders, snoozeAlert, dismissAlert } = require('../src/reminders');
const now = new Date(2026, 9, 18, 9, 30).getTime();
const reminder = (id, repeat = 'once') => ({ id, title: '提醒 ' + id, repeat, enabled: true, nextAt: now - 1000 });
let sequence = 0;
const makeId = () => 'alert-' + ++sequence;

test('old reminder plans migrate while malformed dates and duplicate ids cannot crash a reminder tick', () => {
  const good = reminder('first');
  assert.deepEqual(normalizeReminders([null, {}, good, good, { ...reminder('invalid'), nextAt: 1e100 }, { ...reminder('blank'), title: ' ' }]), [good]);
  assert.deepEqual(normalizeReminderInbox([null, {}, { id: '1', sourceId: 'first', title: '喝水', firedAt: now, status: 'snoozed', snoozeAt: NaN }]), [{ id: '1', sourceId: 'first', title: '喝水', firedAt: now, status: 'pending', snoozeAt: null }]);
});

test('simultaneous reminders keep separate pending records and each occurrence fires only once', () => {
  const plans = [reminder('once'), reminder('daily', 'daily')], inbox = [];
  const due = collectDueReminders(plans, inbox, now, makeId);
  assert.equal(due.length, 2); assert.equal(inbox.length, 2);
  assert.notEqual(due[0].id, due[1].id);
  assert.equal(plans[0].enabled, false);
  assert.ok(plans[1].nextAt > now);
  assert.deepEqual(collectDueReminders(plans, inbox, now + 1000, makeId), []);
  assert.equal(inbox.filter((entry) => entry.status === 'pending').length, 2);
});

test('snoozing survives a restart and does not change tomorrow’s daily reminder plan', () => {
  const plans = [reminder('daily', 'daily')], inbox = [];
  collectDueReminders(plans, inbox, now, makeId);
  const nextDailyAt = plans[0].nextAt, id = inbox[0].id;
  snoozeAlert(inbox, id, 5, now);
  const restored = normalizeReminderInbox(JSON.parse(JSON.stringify(inbox)));
  assert.deepEqual(collectDueReminders(plans, restored, now + 299999, makeId), []);
  assert.equal(collectDueReminders(plans, restored, now + 300000, makeId)[0].id, id);
  assert.equal(restored[0].status, 'pending'); assert.equal(restored[0].snoozeAt, null);
  assert.equal(plans[0].nextAt, nextDailyAt);
  assert.deepEqual(collectDueReminders(plans, restored, now + 300001, makeId), []);
});

test('overdue snoozes return once on reopening, and dismiss cancels a deferred reminder', () => {
  const plans = [reminder('once')], inbox = [];
  collectDueReminders(plans, inbox, now, makeId);
  const id = inbox[0].id;
  snoozeAlert(inbox, id, 10, now);
  const restored = normalizeReminderInbox(JSON.parse(JSON.stringify(inbox)));
  assert.equal(collectDueReminders(plans, restored, now + 3600000, makeId).length, 1);
  snoozeAlert(restored, id, 5, now + 3600000);
  assert.equal(dismissAlert(restored, id), true);
  assert.equal(dismissAlert(restored, id), false);
  assert.deepEqual(collectDueReminders(plans, restored, now + 7200000, makeId), []);
  assert.equal(restored[0].status, 'done');
});

test('stale actions and unsupported snooze durations cannot duplicate or rearm handled reminders', () => {
  const plans = [reminder('once')], inbox = [];
  collectDueReminders(plans, inbox, now, makeId);
  const id = inbox[0].id;
  for (const duration of [undefined, NaN, 0, -1, 60, '5']) {
    if (duration === undefined) continue;
    assert.throws(() => snoozeAlert(inbox, id, duration, now));
  }
  snoozeAlert(inbox, id, 5, now);
  assert.throws(() => snoozeAlert(inbox, id, 5, now));
  dismissAlert(inbox, id);
  assert.throws(() => snoozeAlert(inbox, id, 5, now));
  assert.equal(plans[0].enabled, false);
});

test('completed history is bounded and cannot evict outstanding reminders', () => {
  const entries = Array.from({ length: MAX_HISTORY + 10 }, (_, index) => ({ id: String(index), sourceId: 'source', title: '记录', firedAt: now + index, status: index === 0 ? 'pending' : 'done', snoozeAt: null }));
  const inbox = normalizeReminderInbox(entries);
  assert.equal(inbox.length, MAX_HISTORY + 1);
  assert.ok(inbox.some((entry) => entry.id === '0'));
  assert.equal(inbox[0].id, String(entries.length - 1));
});

test('more than fifty simultaneous reminders all retain a completion and snooze action after restart', () => {
  const plans = Array.from({ length: 60 }, (_, index) => reminder(String(index))), inbox = [];
  assert.equal(collectDueReminders(plans, inbox, now, makeId).length, 60);
  assert.equal(inbox.length, 60);
  const restored = normalizeReminderInbox(JSON.parse(JSON.stringify(inbox)));
  assert.equal(restored.length, 60);
  for (const entry of [...restored]) dismissAlert(restored, entry.id);
  assert.equal(restored.length, MAX_HISTORY);
  assert.ok(restored.every((entry) => entry.status === 'done'));
});
