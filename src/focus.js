const MINUTE = 60000;
function minutes(value, fallback, maximum = 180) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(maximum, Math.round(number))) : fallback;
}
function normalizeFocus(value, now = Date.now()) {
  const settings = { minutes: minutes(value?.settings?.minutes, 25), breakMinutes: minutes(value?.settings?.breakMinutes, 5, 30) };
  const old = value?.session;
  const valid = old && typeof old.id === 'string' && ['focus', 'break'].includes(old.phase) && Number.isFinite(old.durationMs) && Number.isFinite(old.remainingMs);
  const durationMs = valid ? Math.max(MINUTE, Math.min((old.phase === 'break' ? 30 : 180) * MINUTE, old.durationMs)) : 0;
  return { settings, session: valid ? {
    id: old.id.slice(0, 60), phase: old.phase, status: 'paused',
    durationMs,
    remainingMs: Math.max(0, Math.min(durationMs, old.remainingMs)),
    breakMs: minutes(old.breakMs / MINUTE, settings.breakMinutes, 30) * MINUTE,
    lastTickAt: now,
  } : null };
}
function startFocus(focus, input = {}, now = Date.now(), id = String(now)) {
  if (focus.session) throw new Error('这一段还没结束，可以继续或先结束它');
  focus.settings = { minutes: minutes(input.minutes, focus.settings.minutes), breakMinutes: minutes(input.breakMinutes, focus.settings.breakMinutes, 30) };
  const durationMs = focus.settings.minutes * MINUTE;
  focus.session = { id, phase: 'focus', status: 'running', durationMs, remainingMs: durationMs, breakMs: focus.settings.breakMinutes * MINUTE, lastTickAt: now };
}
function tickFocus(focus, now = Date.now()) {
  const session = focus.session;
  if (!session || session.status !== 'running') return { changed: false };
  const elapsed = Math.max(0, now - session.lastTickAt);
  session.lastTickAt = now;
  if (!elapsed && session.remainingMs > 0) return { changed: false };
  session.remainingMs = Math.max(0, session.remainingMs - elapsed);
  if (session.remainingMs) return { changed: true };
  if (session.phase === 'focus') {
    const event = { kind: 'focus', id: session.id, minutes: session.durationMs / MINUTE, breakMinutes: session.breakMs / MINUTE, at: now };
    Object.assign(session, { phase: 'break', durationMs: session.breakMs, remainingMs: session.breakMs });
    return { changed: true, event };
  }
  const event = { kind: 'break', id: session.id, at: now };
  focus.session = null;
  return { changed: true, event };
}
function toggleFocus(focus, now = Date.now()) {
  const session = focus.session;
  if (!session) throw new Error('先开始一段专注吧');
  session.status = session.status === 'running' ? 'paused' : 'running';
  session.lastTickAt = now;
}
function focusView(focus, now = Date.now()) {
  const session = focus.session;
  return { settings: { ...focus.settings }, session: session ? { ...session, endsAt: session.status === 'running' ? now + session.remainingMs : null, progress: Math.max(0, Math.min(100, Math.round((1 - session.remainingMs / session.durationMs) * 100))) } : null };
}
module.exports = { MINUTE, normalizeFocus, startFocus, tickFocus, toggleFocus, focusView };
