const pet = document.getElementById('pet');
const stage = document.getElementById('stage');
const bubble = document.getElementById('bubble');
const effect = document.getElementById('effect');
const usage = document.getElementById('usage');
const customImage = document.getElementById('custom-animation');
const satietyButton = document.getElementById('feeding');
const quickFeedMenu = document.getElementById('quick-feed-menu');
const quickFeedStatus = document.getElementById('quick-feed-status');
let drag = null;
let actionTimer;
let bubbleTimer;
let state = { idleAnimations: true, customActions: [] };
let currentAction = null;
let idleTimer;
let idleSignature;
let previousRandomId;
let feedingEntry = null;
let quickFeedPending = false;

function scheduleIdle() {
  clearTimeout(idleTimer);
  if (!state.idleAnimations || feedingEntry || state.feeding?.isEating || !quickFeedMenu.hidden) return;
  const wait = (state.randomInterval || 30) * 1000 * (.7 + Math.random() * .6);
  idleTimer = setTimeout(() => {
    if (!drag && !currentAction) randomAction();
    else scheduleIdle();
  }, wait);
}

function say(message, duration = 3000) {
  bubble.textContent = message;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), duration);
}
window.yuexin.onHover((hover) => document.body.classList.toggle('over-pet', hover));
function resetAction() {
  clearTimeout(actionTimer);
  if (feedingEntry) { feedingEntry = null; window.yuexin.finishFeeding(); }
  currentAction = null;
  pet.className = 'pet' + (state.idleAnimations ? '' : ' quiet');
  customImage.hidden = true;
  customImage.removeAttribute('src');
  effect.textContent = '';
  scheduleIdle();
}
function playAction(id) {
  if (feedingEntry || state.feeding?.isEating) return;
  const entry = YuexinActions.find((item) => item.id === id) || state.customActions.find((item) => item.id === id);
  if (!entry) return;
  resetAction();
  currentAction = id;
  void pet.offsetWidth;
  pet.classList.add('performing');
  if (!entry.extension) pet.classList.add(id);
  if (entry.extension) {
    customImage.src = 'yuexin-asset://actions/' + entry.id + '.' + entry.extension + '?t=' + Date.now();
    customImage.hidden = false;
  } else effect.textContent = entry.emoji;
  if (!entry.extension) actionTimer = setTimeout(resetAction, entry.duration);
}
customImage.onload = () => {
  if (!currentAction) return;
  pet.classList.add('custom');
  const entry = state.customActions.find((item) => item.id === currentAction);
  actionTimer = setTimeout(resetAction, feedingEntry?.duration || entry?.duration || 5000);
};
customImage.onerror = () => {
  if (feedingEntry && !feedingEntry.preset) {
    feedingEntry.preset = true;
    customImage.src = 'yuexin-asset://feeding/preset.gif?t=' + Date.now();
    return;
  }
  resetAction(); say('这个动作图片无法打开，请重新导入。', 4000);
};
function randomAction() {
  const entry = YuexinLibrary.chooseRandomAction(state.customActions, YuexinActions, previousRandomId);
  if (entry) { previousRandomId = entry.id; playAction(entry.id); }
  else scheduleIdle();
}
pet.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0) return;
  pet.setPointerCapture(event.pointerId);
  const gesture = { x: event.screenX, y: event.screenY, position: null, moved: false };
  drag = gesture;
  window.yuexin.setPetDragging(true);
  try { const position = await window.yuexin.getPetPosition(); if (drag === gesture) gesture.position = position; }
  catch { if (drag === gesture) { drag = null; window.yuexin.setPetDragging(false); } }
});
pet.addEventListener('pointermove', (event) => {
  if (!drag || !drag.position) return;
  const dx = event.screenX - drag.x;
  const dy = event.screenY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  if (!drag.moved && !feedingEntry) resetAction();
  drag.moved = true;
  pet.classList.add('dragging');
  window.yuexin.setPetPosition(drag.position[0] + dx, drag.position[1] + dy);
});
pet.addEventListener('pointerup', () => {
  if (!drag) return;
  const wasDragged = drag.moved;
  drag = null;
  window.yuexin.setPetDragging(false);
  pet.classList.remove('dragging');
  if (!wasDragged) randomAction();
});
pet.addEventListener('pointercancel', () => { drag = null; window.yuexin.setPetDragging(false); pet.classList.remove('dragging'); });
function setQuickFeedOpen(open) {
  quickFeedMenu.hidden = !open;
  satietyButton.setAttribute('aria-expanded', String(open));
  renderQuickFeeding();
  if (open) clearTimeout(idleTimer);
  else scheduleIdle();
}
satietyButton.onclick = () => setQuickFeedOpen(quickFeedMenu.hidden);
document.getElementById('quick-feed-close').onclick = () => setQuickFeedOpen(false);
document.addEventListener('pointerdown', (event) => {
  if (!quickFeedMenu.hidden && !quickFeedMenu.contains(event.target) && !satietyButton.contains(event.target)) setQuickFeedOpen(false);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setQuickFeedOpen(false); });
window.addEventListener('blur', () => setQuickFeedOpen(false));
window.yuexin.onFeedingMenu(() => setQuickFeedOpen(true));
for (const foodId of ['fish', 'snack', 'can']) {
  document.getElementById('quick-feed-' + foodId).onclick = async () => {
    if (quickFeedPending || state.feeding?.isEating || state.feeding?.satiety >= 100) return;
    quickFeedPending = true;
    renderQuickFeeding();
    try { await window.yuexin.feed(foodId); setQuickFeedOpen(false); }
    catch (error) { quickFeedStatus.textContent = error.message; }
    finally { quickFeedPending = false; renderQuickFeeding(false); }
  };
}
function renderQuickFeeding(updateStatus = true) {
  const scale = state.petScale || 1;
  // Keep the food menu readable when the cat itself is scaled down.
  quickFeedMenu.style.transform = 'scale(' + 1 / scale + ')';
  quickFeedMenu.style.width = Math.min(224, 260 * scale - 16) + 'px';
  quickFeedMenu.classList.toggle('compact', scale < .8);
  const rawValue = Number(state.feeding?.satiety ?? 70);
  const value = Number.isFinite(rawValue) ? Math.max(0, Math.min(100, Math.round(rawValue))) : 70;
  satietyButton.style.backgroundImage = 'conic-gradient(' + (value < 30 ? '#db5349' : '#579464') + ' ' + value * 3.6 + 'deg, #e9e1d6 0deg)';
  satietyButton.classList.toggle('hungry', value < 30);
  document.getElementById('satiety-number').textContent = value;
  satietyButton.title = '饱腹度 ' + value + '/100 · 点击喂食';
  satietyButton.setAttribute('aria-label', '饱腹度 ' + value + '/100，点击展开喂食');
  for (const foodId of ['fish', 'snack', 'can']) document.getElementById('quick-feed-' + foodId).disabled = quickFeedPending || Boolean(state.feeding?.isEating) || value >= 100;
  if (updateStatus) quickFeedStatus.textContent = quickFeedPending || state.feeding?.isEating ? '正在吃饭，等吃完再喂吧～' : value >= 100 ? '已经饱饱的啦～' : value < 30 ? '肚子有点饿了，来点好吃的～' : '选一点喜欢的食物。';
  if (!quickFeedMenu.hidden) {
    const availableHeight = 285 * scale;
    const top = Math.max(3, Math.min(75 * scale, availableHeight - quickFeedMenu.offsetHeight - 5));
    quickFeedMenu.style.top = top / scale + 'px';
  }
}
for (const tab of ['reminders', 'chat', 'actions', 'settings', 'usage']) {
  const button = document.getElementById(tab === 'reminders' ? 'reminder' : tab);
  button.onclick = () => window.yuexin.openPanel(tab);
}
function render(nextState) {
  state = nextState;
  const signature = JSON.stringify([state.idleAnimations, state.randomInterval, state.feeding?.isEating, state.customActions.map((item) => [item.id, item.random])]);
  if (signature !== idleSignature) { idleSignature = signature; scheduleIdle(); }
  stage.style.transform = 'scale(' + (state.petScale || 1) + ')';
  pet.classList.toggle('quiet', !state.idleAnimations);
  if (currentAction && !feedingEntry && !YuexinActions.some((item) => item.id === currentAction) && !state.customActions.some((item) => item.id === currentAction)) resetAction();
  renderQuickFeeding();
  const codex = state.limits.buckets.find((entry) => entry.id === 'codex') || state.limits.buckets[0];
  usage.textContent = codex?.windows[0] ? codex.windows[0].remainingPercent + '%' : '--%';
  usage.title = codex?.windows[0] ? 'Codex / Work 剩余 ' + codex.windows[0].remainingPercent + '%' : state.limits.status;
}
window.yuexin.onState(render);
window.yuexin.onAction((id) => playAction(id));
window.yuexin.onFeed((entry) => {
  setQuickFeedOpen(false);
  resetAction();
  clearTimeout(idleTimer);
  feedingEntry = { ...entry };
  currentAction = 'feeding';
  pet.classList.add('performing');
  customImage.src = entry.url + '?t=' + Date.now();
  customImage.hidden = false;
});
window.yuexin.onReminder((title) => {
  resetAction();
  pet.classList.add('performing', 'alarm');
  effect.textContent = '⏰';
  say('提醒时间到：' + title, 9000);
  actionTimer = setTimeout(resetAction, 3200);
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 850;
    gain.gain.setValueAtTime(.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.08, ctx.currentTime + .03);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .32);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + .35);
    oscillator.onended = () => ctx.close();
  } catch {}
});
window.yuexin.getState().then(render);
