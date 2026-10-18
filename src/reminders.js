const { randomUUID } = require('node:crypto');
const { advanceDaily } = require('./core');
const MAX_HISTORY = 50;
const validTime = (value) => Number.isFinite(value) && value > 0 && value <= 8640000000000000;

function normalizeReminders(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).filter((entry) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) || typeof entry.title !== 'string' || !entry.title.trim() || !validTime(entry.nextAt)) return false;
    seen.add(entry.id); return true;
  }).map((entry) => ({ id: entry.id, title: entry.title.trim().slice(0, 100), nextAt: entry.nextAt, repeat: entry.repeat === 'daily' ? 'daily' : 'once', enabled: entry.enabled === true }));
}

function trimInbox(inbox) {
  const outstanding = inbox.filter((entry) => entry.status !== 'done');
  const history = inbox.filter((entry) => entry.status === 'done').sort((a, b) => b.firedAt - a.firedAt).slice(0, MAX_HISTORY);
  inbox.splice(0, inbox.length, ...outstanding.concat(history).sort((a, b) => b.firedAt - a.firedAt));
}

function normalizeReminderInbox(value) {
  const seen = new Set();
  const inbox = [];
  for (const entry of Array.isArray(value) ? value : []) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) || typeof entry.sourceId !== 'string' || typeof entry.title !== 'string' || !entry.title.trim() || !validTime(entry.firedAt)) continue;
    const status = ['pending', 'snoozed', 'done'].includes(entry.status) ? entry.status : 'pending';
    inbox.push({ id: entry.id, sourceId: entry.sourceId, title: entry.title.trim().slice(0, 100), firedAt: entry.firedAt,
      status: status === 'snoozed' && !validTime(entry.snoozeAt) ? 'pending' : status,
      snoozeAt: status === 'snoozed' && validTime(entry.snoozeAt) ? entry.snoozeAt : null });
    seen.add(entry.id);
  }
  trimInbox(inbox); return inbox;
}

function collectDueReminders(reminders, inbox, now = Date.now(), makeId = randomUUID) {
  if (!validTime(now)) return [];
  const due = [];
  for (const entry of inbox) {
    if (entry.status !== 'snoozed' || !validTime(entry.snoozeAt) || entry.snoozeAt > now) continue;
    entry.status = 'pending'; entry.snoozeAt = null; entry.firedAt = now;
    due.push(entry);
  }
  for (const reminder of reminders) {
    if (!reminder.enabled || !validTime(reminder.nextAt) || reminder.nextAt > now) continue;
    if (reminder.repeat === 'daily') reminder.nextAt = advanceDaily(reminder.nextAt, now);
    else reminder.enabled = false;
    const entry = { id: makeId(), sourceId: reminder.id, title: reminder.title, firedAt: now, status: 'pending', snoozeAt: null };
    inbox.push(entry); due.push(entry);
  }
  if (due.length) trimInbox(inbox);
  return due;
}

function snoozeAlert(inbox, id, minutes = 5, now = Date.now()) {
  if (![5, 10].includes(minutes) || !validTime(now) || !validTime(now + minutes * 60000)) throw new Error('请选择 5 或 10 分钟后再提醒');
  const entry = inbox.find((item) => item.id === id);
  if (!entry || entry.status !== 'pending') throw new Error('这条提醒已经处理过啦');
  entry.status = 'snoozed'; entry.snoozeAt = now + minutes * 60000;
  return true;
}

function dismissAlert(inbox, id) {
  const entry = inbox.find((item) => item.id === id);
  if (!entry || entry.status === 'done') return false;
  entry.status = 'done'; entry.snoozeAt = null;
  trimInbox(inbox);
  return true;
}

module.exports = { MAX_HISTORY, normalizeReminders, normalizeReminderInbox, collectDueReminders, snoozeAlert, dismissAlert };
