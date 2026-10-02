function nextDailyTime(time, after = new Date()) {
  const [hour, minute] = String(time).split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('请选择有效的提醒时间');
  }
  const next = new Date(after);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= after.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function advanceDaily(timestamp, now = Date.now()) {
  const original = new Date(timestamp);
  const time = `${String(original.getHours()).padStart(2, '0')}:${String(original.getMinutes()).padStart(2, '0')}`;
  return nextDailyTime(time, new Date(now));
}

function normalizeLimits(result) {
  const buckets = result?.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length
    ? Object.values(result.rateLimitsByLimitId)
    : result?.rateLimits ? [result.rateLimits] : [];
  return buckets.map((bucket) => ({
    id: bucket.limitId || 'codex',
    name: bucket.limitName || (bucket.limitId === 'codex' ? 'Codex / Work' : bucket.limitId || '用量'),
    windows: [bucket.primary, bucket.secondary].filter(Boolean).map((window) => ({
      durationMins: window.windowDurationMins,
      remainingPercent: Math.max(0, Math.min(100, Math.round(100 - window.usedPercent))),
      resetsAt: window.resetsAt,
    })),
  })).filter((bucket) => bucket.windows.length);
}

module.exports = { nextDailyTime, advanceDaily, normalizeLimits };
