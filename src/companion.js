const HOUR = 60 * 60 * 1000;
const BOND_DAILY_LIMIT = 30;
const COOLDOWNS = { petting: 12000, play: 45000 };
const LEVELS = [
  { name: '初见', points: 0 }, { name: '熟悉', points: 50 },
  { name: '亲近', points: 150 }, { name: '默契', points: 350 },
  { name: '家人', points: 700 },
];
const TASKS = ['feed', 'petting', 'play'];

function integer(value, fallback, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}
function dayKey(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function freshDay(now) {
  return { date: dayKey(now), feed: false, petting: false, play: false, bondGained: 0, rewarded: false };
}
function normalizeCompanion(value, now = Date.now()) {
  const daily = value?.daily?.date === dayKey(now) ? value.daily : freshDay(now);
  return {
    mood: integer(value?.mood, 75, 0, 100), bond: integer(value?.bond, 0, 0, 1000),
    updatedAt: Number.isFinite(value?.updatedAt) && value.updatedAt > 0 ? Math.min(value.updatedAt, now) : now,
    sleeping: value?.sleeping === true,
    daily: { date: daily.date, feed: daily.feed === true, petting: daily.petting === true, play: daily.play === true, bondGained: integer(daily.bondGained, 0, 0, BOND_DAILY_LIMIT), rewarded: daily.rewarded === true },
    lastVisit: typeof value?.lastVisit === 'string' ? value.lastVisit : null,
    daysTogether: integer(value?.daysTogether, 0, 0, 99999),
    lastInteractions: Object.fromEntries(Object.keys(COOLDOWNS).map((key) => [key, Number.isFinite(value?.lastInteractions?.[key]) ? Math.min(Math.max(0, value.lastInteractions[key]), now) : 0])),
    animations: Object.fromEntries(['petting', 'play', 'sleep'].map((key) => {
      const id = value?.animations?.[key];
      return [key, id === 'original' || id === 'auto' || (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) ? id : key === 'sleep' ? 'original' : 'auto'];
    })),
  };
}
function advanceCompanion(companion, satiety, now = Date.now()) {
  let changed = false;
  if (companion.daily.date !== dayKey(now)) { companion.daily = freshDay(now); changed = true; }
  if (now < companion.updatedAt) { companion.updatedAt = now; return true; }
  const elapsed = Math.floor((now - companion.updatedAt) / HOUR);
  if (!elapsed) return changed;
  // A long absence has at most eight hours of effect; affection never decays.
  const steps = Math.min(elapsed, 8);
  const target = satiety < 30 ? 40 : companion.sleeping ? 85 : 65;
  const speed = companion.mood < target && !companion.sleeping ? 1 : 2;
  companion.mood += Math.sign(target - companion.mood) * Math.min(Math.abs(target - companion.mood), steps * speed);
  companion.updatedAt += elapsed * HOUR;
  return true;
}
function favoriteFood(now = Date.now()) {
  const index = [...dayKey(now)].reduce((total, character) => total * 31 + character.charCodeAt(0), 0) >>> 0;
  return ['fish', 'snack', 'can'][index % 3];
}
function bondLevel(points) {
  let index = LEVELS.findLastIndex((level) => points >= level.points);
  index = Math.max(0, index);
  const level = LEVELS[index];
  const next = LEVELS[index + 1];
  return { name: level.name, next: next?.name || null, remaining: next ? next.points - points : 0, progress: next ? Math.round((points - level.points) / (next.points - level.points) * 100) : 100 };
}
function companionView(companion, now = Date.now()) {
  const mood = companion.mood;
  const emotion = companion.sleeping ? { emoji: '💤', name: '睡觉中' } : mood >= 85 ? { emoji: '🥰', name: '幸福' } : mood >= 65 ? { emoji: '😊', name: '开心' } : mood >= 40 ? { emoji: '🙂', name: '平静' } : { emoji: '🥺', name: '想被陪陪' };
  const daily = companion.daily.date === dayKey(now) ? companion.daily : freshDay(now);
  return { ...companion, daily, emotion, level: bondLevel(companion.bond), favoriteFood: favoriteFood(now), cooldownUntil: Object.fromEntries(Object.entries(COOLDOWNS).map(([key, wait]) => [key, companion.lastInteractions[key] ? companion.lastInteractions[key] + wait : 0])) };
}
function interactCompanion(companion, type, satiety, now = Date.now(), foodId) {
  if (!TASKS.includes(type)) throw new Error('这个互动暂时还不会哦');
  advanceCompanion(companion, satiety, now);
  if (companion.sleeping && type !== 'feed') throw new Error('正在睡觉，先叫它起床吧～');
  const last = companion.lastInteractions[type];
  if (COOLDOWNS[type] && last && now - last < COOLDOWNS[type]) throw new Error(type === 'petting' ? '刚刚已经摸摸啦，等一小会儿～' : '刚玩过啦，休息一会儿再玩～');
  if (type === 'feed' && !['fish', 'snack', 'can'].includes(foodId)) throw new Error('请选择一种食物');
  const beforeMood = companion.mood;
  const beforeBond = companion.bond;
  const beforeLevel = bondLevel(beforeBond).name;
  if (type === 'feed' && companion.sleeping) { companion.sleeping = false; companion.updatedAt = now; }
  const favorite = type === 'feed' && foodId === favoriteFood(now);
  companion.mood = Math.min(100, companion.mood + (type === 'petting' ? 5 : type === 'play' ? 8 : foodId === 'snack' ? 7 : 4) + (favorite ? 3 : 0));
  if (COOLDOWNS[type]) companion.lastInteractions[type] = now;
  let bondGain = type === 'play' ? 3 : 2;
  if (companion.lastVisit !== dayKey(now)) { companion.lastVisit = dayKey(now); companion.daysTogether += 1; bondGain += 2; }
  if (!companion.daily[type]) { companion.daily[type] = true; bondGain += 1; }
  const completed = TASKS.every((key) => companion.daily[key]) && !companion.daily.rewarded;
  if (completed) { companion.daily.rewarded = true; bondGain += 5; companion.mood = Math.min(100, companion.mood + 5); }
  bondGain = Math.min(bondGain, BOND_DAILY_LIMIT - companion.daily.bondGained, 1000 - companion.bond);
  companion.bond += bondGain;
  companion.daily.bondGained += bondGain;
  return { type, moodGained: companion.mood - beforeMood, bondGained: companion.bond - beforeBond, favorite, completed, levelUp: bondLevel(companion.bond).name !== beforeLevel };
}
function setSleeping(companion, sleeping, satiety, now = Date.now()) {
  advanceCompanion(companion, satiety, now);
  // Start a fresh rest interval so time spent awake is never rewarded as sleep.
  if (companion.sleeping !== Boolean(sleeping)) companion.updatedAt = now;
  companion.sleeping = Boolean(sleeping);
}

function rewardFocus(companion, satiety, now = Date.now()) {
  advanceCompanion(companion, satiety, now);
  const moodGained = Math.min(3, 100 - companion.mood);
  let gain = 2;
  if (companion.lastVisit !== dayKey(now)) { companion.lastVisit = dayKey(now); companion.daysTogether += 1; gain += 2; }
  const bondGained = Math.min(gain, BOND_DAILY_LIMIT - companion.daily.bondGained, 1000 - companion.bond);
  companion.mood += moodGained; companion.bond += bondGained; companion.daily.bondGained += bondGained;
  return { moodGained, bondGained };
}

module.exports = { HOUR, COOLDOWNS, BOND_DAILY_LIMIT, dayKey, normalizeCompanion, advanceCompanion, companionView, interactCompanion, setSleeping, rewardFocus };
