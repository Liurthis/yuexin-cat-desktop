const DECAY_INTERVAL = 10 * 60 * 1000;
const FOODS = [
  { id: 'fish', name: '小鱼干', emoji: '🐟', amount: 20 },
  { id: 'snack', name: '小零食', emoji: '🍪', amount: 10 },
  { id: 'can', name: '猫罐头', emoji: '🥫', amount: 35 },
];

function normalizeFeeding(value, now = Date.now()) {
  return {
    satiety: typeof value?.satiety === 'number' && Number.isFinite(value.satiety) ? Math.max(0, Math.min(100, Math.round(value.satiety))) : 70,
    updatedAt: Number.isFinite(value?.updatedAt) && value.updatedAt > 0 ? Math.min(value.updatedAt, now) : now,
    duration: Number.isFinite(value?.duration) ? Math.max(2000, Math.min(120000, Math.round(value.duration))) : 5000,
    image: value?.image || null,
  };
}

function advanceSatiety(feeding, now = Date.now()) {
  if (now < feeding.updatedAt) { feeding.updatedAt = now; return true; }
  const steps = Math.floor((now - feeding.updatedAt) / DECAY_INTERVAL);
  if (!steps) return false;
  feeding.satiety = Math.max(0, feeding.satiety - steps);
  feeding.updatedAt += steps * DECAY_INTERVAL;
  return true;
}

function feedPet(feeding, foodId, now = Date.now()) {
  const food = FOODS.find((entry) => entry.id === foodId);
  if (!food) throw new Error('请选择一种食物');
  advanceSatiety(feeding, now);
  if (feeding.satiety >= 100) throw new Error('已经饱饱的啦，等肚子空一点再喂吧～');
  const previous = feeding.satiety;
  feeding.satiety = Math.min(100, previous + food.amount);
  feeding.updatedAt = now;
  return { food, gained: feeding.satiety - previous, satiety: feeding.satiety };
}

module.exports = { FOODS, DECAY_INTERVAL, normalizeFeeding, advanceSatiety, feedPet };
