const { dayKey } = require('./companion');
const RETAIN_DAYS = 90;
const FOOD_NAMES = { fish: '小鱼干', snack: '小零食', can: '猫罐头' };
const BADGES = [
  { id: 'first-meal', emoji: '🐟', name: '第一顿好饭', description: '喂食一次', check: (totals) => totals.feed >= 1 },
  { id: 'gentle-hand', emoji: '🤲', name: '温柔的手', description: '摸摸一次', check: (totals) => totals.petting >= 1 },
  { id: 'playmate', emoji: '🧶', name: '最佳玩伴', description: '完成一局逗猫', check: (totals) => totals.play >= 1 },
  { id: 'focus-buddy', emoji: '🍅', name: '专注搭子', description: '完成一段专注', check: (totals) => totals.focus >= 1 },
  { id: 'hundred-minutes', emoji: '⏳', name: '陪你一百分钟', description: '累计完成 100 分钟专注', check: (totals) => totals.focusMinutes >= 100 },
  { id: 'one-week', emoji: '🌱', name: '一周的陪伴', description: '累计陪伴七天', check: (_totals, companion) => companion.daysTogether >= 7 },
];
function count(value) { return Number.isFinite(value) ? Math.max(0, Math.min(9999999, Math.round(value))) : 0; }
function normalizeJournal(value) {
  const days = (Array.isArray(value?.days) ? value.days : []).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day?.date)).map((day) => ({
    date: day.date, feed: count(day.feed), petting: count(day.petting), play: count(day.play), focus: count(day.focus), focusMinutes: count(day.focusMinutes),
    foods: Object.fromEntries(Object.keys(FOOD_NAMES).map((id) => [id, count(day.foods?.[id])])),
    mood: count(day.mood), bond: count(day.bond),
    entries: (Array.isArray(day.entries) ? day.entries : []).filter((entry) => Number.isFinite(entry?.at) && typeof entry.text === 'string').slice(-40).map((entry) => ({ at: entry.at, text: entry.text.slice(0, 180) })),
  })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, RETAIN_DAYS);
  const totals = Object.fromEntries(['feed', 'petting', 'play', 'focus', 'focusMinutes'].map((key) => [key, count(value?.totals?.[key])]));
  const badges = (Array.isArray(value?.badges) ? value.badges : []).filter((entry) => BADGES.some((badge) => badge.id === entry?.id) && Number.isFinite(entry?.at)).map((entry) => ({ id: entry.id, at: entry.at }));
  return { days, totals, badges };
}
function recordJournal(journal, type, detail, companion, now = Date.now()) {
  if (!['feed', 'petting', 'play', 'focus'].includes(type)) return;
  const date = dayKey(now);
  let day = journal.days.find((entry) => entry.date === date);
  if (!day) {
    day = { date, feed: 0, petting: 0, play: 0, focus: 0, focusMinutes: 0, foods: { fish: 0, snack: 0, can: 0 }, mood: companion.mood, bond: companion.bond, entries: [] };
    journal.days.push(day); journal.days.sort((a, b) => b.date.localeCompare(a.date)); journal.days = journal.days.slice(0, RETAIN_DAYS);
  }
  day[type] += 1; journal.totals[type] += 1;
  let text = type === 'petting' ? '你摸摸我的头，今天又被温柔地照顾了。' : '一起玩了逗猫球，我抓到三次啦！';
  if (type === 'feed') {
    if (FOOD_NAMES[detail.foodId]) day.foods[detail.foodId] += 1;
    text = '你给我喂了' + (FOOD_NAMES[detail.foodId] || '好吃的') + (detail.favorite ? '，还是今天最爱的口味！' : '，小肚子暖暖的。');
  }
  if (type === 'focus') {
    const duration = count(detail.minutes);
    day.focusMinutes += duration; journal.totals.focusMinutes += duration;
    text = '安静陪你完成了 ' + duration + ' 分钟专注，休息一下吧。';
  }
  day.mood = companion.mood; day.bond = companion.bond;
  day.entries.push({ at: now, text });
  if (detail.completed) day.entries.push({ at: now, text: '今天的喂食、摸摸和逗猫都集齐了，是被好好陪伴的一天 ♥' });
  if (detail.levelUp) day.entries.push({ at: now, text: '我们的关系又更近了一点 ♥' });
  day.entries = day.entries.slice(-40);
  for (const badge of BADGES) {
    if (!journal.badges.some((entry) => entry.id === badge.id) && badge.check(journal.totals, companion)) journal.badges.push({ id: badge.id, at: now });
  }
}
function daySummary(day) {
  const parts = [];
  if (day.feed) parts.push('吃了 ' + day.feed + ' 次好吃的');
  if (day.petting) parts.push('收到了 ' + day.petting + ' 次摸摸');
  if (day.play) parts.push('一起玩了 ' + day.play + ' 局逗猫');
  if (day.focusMinutes) parts.push('陪你专注了 ' + day.focusMinutes + ' 分钟');
  return parts.length ? '今天' + parts.join('，') + '。' : '今天的故事等你来写。';
}
function journalView(journal) {
  return { days: journal.days.map((day) => ({ ...day, summary: daySummary(day) })), totals: { ...journal.totals }, badges: BADGES.map(({ check, ...badge }) => ({ ...badge, earnedAt: journal.badges.find((entry) => entry.id === badge.id)?.at || null })) };
}
function journalText(journal, petName = '月薪喵') {
  const view = journalView(journal);
  return [petName + '的陪伴日记', '', ...view.days.flatMap((day) => [day.date, day.summary, ...day.entries.map((entry) => new Date(entry.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) + '  ' + entry.text), '']), '纪念章', ...view.badges.filter((badge) => badge.earnedAt).map((badge) => badge.emoji + ' ' + badge.name)].join('\r\n');
}
module.exports = { RETAIN_DAYS, normalizeJournal, recordJournal, journalView, journalText };
