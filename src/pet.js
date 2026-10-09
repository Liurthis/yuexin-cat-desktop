const pet = document.getElementById('pet');
const stage = document.getElementById('stage');
const bubble = document.getElementById('bubble');
const effect = document.getElementById('effect');
const usage = document.getElementById('usage');
const customImage = document.getElementById('custom-animation');
const satietyButton = document.getElementById('feeding');
const quickFeedMenu = document.getElementById('quick-feed-menu');
const quickFeedStatus = document.getElementById('quick-feed-status');
const moodButton = document.getElementById('mood-button');
const companionMenu = document.getElementById('companion-menu');
const companionStatus = document.getElementById('companion-status');
const hearts = document.getElementById('affection-effect');
const toy = document.getElementById('toy');
const playHud = document.getElementById('play-hud');
const strokes = YuexinPetting.createPettingGesture();
const focusButton = document.getElementById('focus-button');
const focusMenu = document.getElementById('focus-menu');
let focusPending = false;
let focusImageUrl;
let pendingGreeting = false;
let pendingCelebration = 0;
function focusing() { return state.focus?.session?.phase === 'focus' && state.focus.session.status === 'running'; }
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
let interactionPending = false;
let play = null;
let playTimer;
let playTick;
let cooldownTimer;
let heartTimer;
let sleepImageUrl;
let nextPettingAt = 0;
let lastBusyReport;
let walkImageUrl;
let habitPending = false;

function reportActivity() {
  const menu = !quickFeedMenu.hidden || !companionMenu.hidden || !focusMenu.hidden || Boolean(play);
  const info = { menu, busy: menu || Boolean(drag) || Boolean(feedingEntry) || Boolean(currentAction && currentAction !== 'walking') };
  const signature = JSON.stringify(info);
  if (signature !== lastBusyReport) { lastBusyReport = signature; window.yuexin.setPetBusy(info); }
}

function scheduleIdle() {
  reportActivity();
  clearTimeout(idleTimer);
  if (!state.idleAnimations || state.quietMode || state.roaming?.isWalking || focusing() || feedingEntry || state.feeding?.isEating || state.companion?.sleeping || play || !quickFeedMenu.hidden || !companionMenu.hidden || !focusMenu.hidden) return;
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
function resetAction(resumeSleep = true) {
  clearTimeout(actionTimer);
  if (feedingEntry) { feedingEntry = null; window.yuexin.finishFeeding(); }
  currentAction = null;
  pet.className = 'pet' + (state.idleAnimations && !state.quietMode && !focusing() ? '' : ' quiet');
  customImage.hidden = true;
  customImage.removeAttribute('src');
  effect.textContent = '';
  sleepImageUrl = null;
  focusImageUrl = null;
  walkImageUrl = null;
  if (resumeSleep) {
    if (tryCelebration()) return;
    syncSleeping(); syncFocusPose(); syncWalking(); tryGreeting();
  }
  scheduleIdle();
}
function playAction(id) {
  if (feedingEntry || state.feeding?.isEating || state.companion?.sleeping || play) return;
  const entry = YuexinActions.find((item) => item.id === id) || state.customActions.find((item) => item.id === id);
  if (!entry) return;
  if (state.roaming?.isWalking) window.yuexin.setPetBusy({ busy: true, menu: false });
  resetAction(false);
  currentAction = id;
  void pet.offsetWidth;
  pet.classList.add('performing');
  if (!entry.extension) pet.classList.add(id);
  if (entry.extension) {
    customImage.src = 'yuexin-asset://actions/' + entry.id + '.' + entry.extension + '?t=' + Date.now();
    customImage.hidden = false;
  } else effect.textContent = entry.emoji;
  if (!entry.extension) actionTimer = setTimeout(resetAction, entry.duration);
  reportActivity();
}
customImage.onload = () => {
  if (!currentAction) return;
  pet.classList.add('custom');
  if (['sleeping', 'focusing', 'walking'].includes(currentAction)) return;
  const entry = state.customActions.find((item) => item.id === currentAction);
  actionTimer = setTimeout(resetAction, feedingEntry?.duration || entry?.duration || 5000);
};
customImage.onerror = () => {
  if (['sleeping', 'focusing', 'walking'].includes(currentAction)) {
    customImage.hidden = true; customImage.removeAttribute('src'); pet.classList.remove('custom');
    return;
  }
  if (feedingEntry && !feedingEntry.preset) {
    feedingEntry.preset = true;
    customImage.src = 'yuexin-asset://feeding/preset.gif?t=' + Date.now();
    return;
  }
  resetAction(); say('这个动作图片无法打开，请重新导入。', 4000);
};
function randomAction() {
  const tag = YuexinContext.contextTag(state);
  const entry = YuexinContext.chooseForTag(state.customActions, tag, previousRandomId) || YuexinContext.chooseForTag(state.customActions, 'idle', previousRandomId) || YuexinLibrary.chooseRandomAction(state.customActions.filter((item) => YuexinContext.normalizeTags(item).length), YuexinActions, previousRandomId);
  if (entry) { previousRandomId = entry.id; playAction(entry.id); }
  else scheduleIdle();
}
pet.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0) return;
  pet.setPointerCapture(event.pointerId);
  const gesture = { x: event.screenX, y: event.screenY, position: null, moved: false };
  drag = gesture;
  strokes.reset();
  window.yuexin.setPetDragging(true);
  reportActivity();
  try { const position = await window.yuexin.getPetPosition(); if (drag === gesture) gesture.position = position; }
  catch { if (drag === gesture) { drag = null; window.yuexin.setPetDragging(false); } }
});
pet.addEventListener('pointermove', (event) => {
  if (!drag || !drag.position) return;
  const dx = event.screenX - drag.x;
  const dy = event.screenY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  if (!drag.moved && !feedingEntry) resetAction();
  if (!drag.moved) stopPlay();
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
  if (!wasDragged) {
    if (state.companion?.sleeping) window.yuexin.setSleeping(false).catch(() => {});
    else randomAction();
  }
  reportActivity();
});
pet.addEventListener('pointercancel', () => { drag = null; window.yuexin.setPetDragging(false); pet.classList.remove('dragging'); reportActivity(); });
pet.addEventListener('pointermove', (event) => {
  if (drag || play || feedingEntry || state.feeding?.isEating || state.companion?.sleeping || Date.now() < nextPettingAt || !companionMenu.hidden || !quickFeedMenu.hidden || !focusMenu.hidden) { strokes.reset(); return; }
  const bounds = pet.getBoundingClientRect();
  if (strokes.move((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height, event.buttons !== 0)) petCat(true);
});
pet.addEventListener('pointerleave', () => strokes.reset());

function fitPopover(menu, origin) {
  const scale = state.petScale || 1;
  menu.style.transform = 'scale(' + 1 / scale + ')';
  menu.style.width = Math.min(224, 260 * scale - 16) + 'px';
  menu.classList.toggle('compact', scale < .8);
  // Insets use screen pixels so the smallest pet still leaves room for readable text.
  menu.style[origin] = 8 / scale + 'px';
  menu.style.maxHeight = Math.max(140, 285 * scale - 10) + 'px';
  menu.style.overflowY = 'auto';
  const preferredTop = menu === focusMenu ? 171 : menu === companionMenu ? 123 : 75;
  if (!menu.hidden) menu.style.top = Math.max(3, Math.min(preferredTop * scale, 285 * scale - menu.offsetHeight - 5)) / scale + 'px';
}
function setQuickFeedOpen(open) {
  if (open) { setCompanionOpen(false); setFocusOpen(false); stopPlay(); }
  quickFeedMenu.hidden = !open;
  satietyButton.setAttribute('aria-expanded', String(open));
  renderQuickFeeding();
  if (open) clearTimeout(idleTimer);
  else scheduleIdle();
  reportActivity();
}
satietyButton.onclick = () => setQuickFeedOpen(quickFeedMenu.hidden);
document.getElementById('quick-feed-close').onclick = () => setQuickFeedOpen(false);
document.addEventListener('pointerdown', (event) => {
  if (!quickFeedMenu.hidden && !quickFeedMenu.contains(event.target) && !satietyButton.contains(event.target)) setQuickFeedOpen(false);
  if (!companionMenu.hidden && !companionMenu.contains(event.target) && !moodButton.contains(event.target)) setCompanionOpen(false);
  if (!focusMenu.hidden && !focusMenu.contains(event.target) && !focusButton.contains(event.target)) setFocusOpen(false);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { setQuickFeedOpen(false); setCompanionOpen(false); setFocusOpen(false); stopPlay(); } });
window.addEventListener('blur', () => { setQuickFeedOpen(false); setCompanionOpen(false); setFocusOpen(false); });
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
  const rawValue = Number(state.feeding?.satiety ?? 70);
  const value = Number.isFinite(rawValue) ? Math.max(0, Math.min(100, Math.round(rawValue))) : 70;
  satietyButton.style.backgroundImage = 'conic-gradient(' + (value < 30 ? '#db5349' : '#579464') + ' ' + value * 3.6 + 'deg, #e9e1d6 0deg)';
  satietyButton.classList.toggle('hungry', value < 30);
  document.getElementById('satiety-number').textContent = value;
  satietyButton.title = '饱腹度 ' + value + '/100 · 点击喂食';
  satietyButton.setAttribute('aria-label', '饱腹度 ' + value + '/100，点击展开喂食');
  const favorites = { fish: '小鱼干', snack: '小零食', can: '猫罐头' };
  for (const foodId of ['fish', 'snack', 'can']) {
    const button = document.getElementById('quick-feed-' + foodId);
    button.disabled = quickFeedPending || Boolean(state.feeding?.isEating) || value >= 100;
    button.title = '心情 +' + ((foodId === 'snack' ? 7 : 4) + (state.companion?.favoriteFood === foodId ? 3 : 0));
  }
  if (updateStatus) quickFeedStatus.textContent = quickFeedPending || state.feeding?.isEating ? '正在吃饭，等吃完再喂吧～' : value >= 100 ? '已经饱饱的啦～' : state.companion ? '今日最爱：' + favorites[state.companion.favoriteFood] + ' · 心情额外 +3' : value < 30 ? '肚子有点饿了，来点好吃的～' : '选一点喜欢的食物。';
  fitPopover(quickFeedMenu, 'right');
}

function setCompanionOpen(open) {
  if (open) { setQuickFeedOpen(false); setFocusOpen(false); stopPlay(); }
  companionMenu.hidden = !open;
  moodButton.setAttribute('aria-expanded', String(open));
  renderCompanion();
  if (open) clearTimeout(idleTimer); else scheduleIdle();
  reportActivity();
}
moodButton.onclick = () => setCompanionOpen(companionMenu.hidden);
document.getElementById('companion-close').onclick = () => setCompanionOpen(false);
window.yuexin.onCompanionMenu(() => setCompanionOpen(true));
function renderCompanion(updateStatus = true) {
  const companion = state.companion;
  if (!companion) { fitPopover(companionMenu, 'right'); return; }
  const { mood, emotion, level, bond, sleeping, daily } = companion;
  document.getElementById('mood-emoji').textContent = emotion.emoji;
  document.getElementById('mood-number').textContent = mood;
  document.getElementById('mood-label').textContent = emotion.emoji + ' ' + (state.petName || '月薪喵') + ' · ' + mood;
  document.getElementById('mood-label').title = (state.petName || '月薪喵') + ' · ' + emotion.name;
  moodButton.classList.toggle('low', mood < 40);
  moodButton.classList.toggle('sleeping', sleeping);
  moodButton.title = '心情 ' + mood + '/100 · ' + level.name + ' · 亲密度 ' + bond;
  moodButton.setAttribute('aria-label', moodButton.title + '，点击展开陪伴选项');
  document.getElementById('mood-fill').style.width = mood + '%';
  document.getElementById('mood-meter').setAttribute('aria-valuenow', mood);
  document.getElementById('bond-fill').style.width = level.progress + '%';
  document.getElementById('bond-meter').setAttribute('aria-valuenow', level.progress);
  document.getElementById('bond-label').textContent = level.name + ' · 亲密 ' + bond;
  document.getElementById('bond-label').title = level.next ? '再增加 ' + level.remaining + ' 亲密度就到「' + level.next + '」' : '已经是家人啦～';
  const completed = ['feed', 'petting', 'play'].filter((key) => daily[key]).length;
  document.getElementById('daily-together').textContent = '今日 ' + completed + '/3';
  document.getElementById('daily-together').title = '喂食' + (daily.feed ? ' ✓' : '') + ' · 摸摸' + (daily.petting ? ' ✓' : '') + ' · 逗猫' + (daily.play ? ' ✓' : '') + '，集齐奖励心情 +5、亲密 +5';
  const busy = interactionPending || Boolean(state.feeding?.isEating) || Boolean(play);
  const now = Date.now();
  const petWait = Math.max(0, (companion.cooldownUntil.petting - now) / 1000);
  const playWait = Math.max(0, (companion.cooldownUntil.play - now) / 1000);
  const petButton = document.getElementById('petting-button');
  const playButton = document.getElementById('play-button');
  petButton.disabled = busy || sleeping || petWait > 0;
  playButton.disabled = busy || sleeping || playWait > 0;
  petButton.title = petWait ? '再等 ' + Math.ceil(petWait) + ' 秒' : '心情 +5，亲密度 +2';
  playButton.title = playWait ? '再等 ' + Math.ceil(playWait) + ' 秒' : '点到小球 3 次：心情 +8，亲密度 +3';
  const sleepButton = document.getElementById('sleep-button');
  sleepButton.textContent = sleeping ? '☀ 起床' : '💤 睡觉';
  sleepButton.disabled = interactionPending || Boolean(state.feeding?.isEating);
  const walkButton = document.getElementById('walk-button');
  const returning = state.roaming?.isWalking || state.roaming?.awayFromHome;
  walkButton.textContent = returning ? '🏠 回小窝' : '🐾 出去走走';
  walkButton.disabled = habitPending || (!returning && (busy || sleeping || focusing() || state.quietMode));
  walkButton.title = returning ? '回到你上次拖放的位置' : state.quietMode ? '关闭安静陪伴后再出去走走' : '在小窝附近走一小段，自己回来';
  const quietButton = document.getElementById('quiet-button');
  quietButton.textContent = state.quietMode ? '☀ 恢复活力' : '🌙 安静陪伴';
  quietButton.disabled = habitPending; quietButton.setAttribute('aria-pressed', String(Boolean(state.quietMode)));
  if (updateStatus) companionStatus.textContent = sleeping ? '安静睡一会儿，心情慢慢恢复～' : completed === 3 ? '今天的陪伴集齐啦 ♥ 第 ' + companion.daysTogether + ' 天' : '头顶来回移动鼠标，也能摸摸～';
  clearTimeout(cooldownTimer);
  const wait = Math.min(...[petWait, playWait].filter((seconds) => seconds > 0));
  if (Number.isFinite(wait)) cooldownTimer = setTimeout(() => renderCompanion(false), Math.ceil(wait * 1000) + 30);
  fitPopover(companionMenu, 'right');
}
function showHearts() {
  clearTimeout(heartTimer);
  hearts.classList.remove('show'); void hearts.offsetWidth;
  hearts.classList.add('show');
  heartTimer = setTimeout(() => hearts.classList.remove('show'), 2100);
}
function interactionAction(kind) {
  const setting = state.companion?.animations[kind];
  if (setting === 'original') return null;
  const selected = state.customActions.find((entry) => entry.id === setting);
  if (selected) return selected;
  if (kind === 'sleep') return YuexinContext.chooseForTag(state.customActions, 'sleep', null) || null;
  const name = kind === 'petting' ? '爱你' : '喜欢';
  return state.customActions.find((entry) => entry.name === name) || null;
}
function syncFocusPose() {
  if (!focusing() || state.companion?.sleeping || feedingEntry || state.feeding?.isEating || play) {
    if (currentAction === 'focusing') resetAction(false);
    return;
  }
  if (currentAction && currentAction !== 'focusing') return;
  const entry = state.customActions.find((item) => item.random !== false && YuexinContext.normalizeTags(item).includes('focus'));
  const url = entry ? 'yuexin-asset://actions/' + entry.id + '.' + entry.extension : null;
  pet.classList.add('focus-pose', 'performing'); currentAction = 'focusing';
  if (focusImageUrl !== url) {
    focusImageUrl = url; pet.classList.remove('custom'); customImage.hidden = !url;
    if (url) customImage.src = url; else customImage.removeAttribute('src');
  }
}
function syncWalking() {
  if (!state.roaming?.isWalking || state.quietMode || state.companion?.sleeping || focusing() || feedingEntry || play) {
    if (currentAction === 'walking') resetAction(false);
    return;
  }
  if (currentAction && currentAction !== 'walking') return;
  const entry = state.customActions.find((item) => item.random !== false && YuexinContext.normalizeTags(item).includes('walk'));
  const url = entry ? 'yuexin-asset://actions/' + entry.id + '.' + entry.extension : null;
  currentAction = 'walking'; clearTimeout(actionTimer); clearTimeout(idleTimer);
  pet.classList.add('walking', 'performing'); pet.classList.toggle('walk-left', state.roaming.direction < 0);
  if (walkImageUrl !== url) {
    walkImageUrl = url; pet.classList.remove('custom'); customImage.hidden = !url;
    if (url) customImage.src = url; else customImage.removeAttribute('src');
  }
  reportActivity();
}
window.yuexin.onWalk((info) => {
  state.roaming = { ...state.roaming, isWalking: info.active, direction: info.direction };
  if (info.active && currentAction !== 'walking') resetAction(false);
  syncWalking(); scheduleIdle(); renderCompanion();
});
document.getElementById('walk-button').onclick = async () => {
  if (habitPending) return;
  const returning = state.roaming?.isWalking || state.roaming?.awayFromHome;
  if (!returning) resetAction(false);
  habitPending = true; setCompanionOpen(false); setQuickFeedOpen(false); setFocusOpen(false); renderCompanion(false);
  try { await window.yuexin.toggleWalk(); }
  catch (error) { setCompanionOpen(true); companionStatus.textContent = error.message; }
  finally { habitPending = false; renderCompanion(false); }
};
document.getElementById('quiet-button').onclick = async () => {
  if (habitPending) return;
  habitPending = true; renderCompanion(false);
  try { await window.yuexin.setQuietMode(!state.quietMode); setCompanionOpen(false); }
  catch (error) { companionStatus.textContent = error.message; }
  finally { habitPending = false; renderCompanion(false); }
};
function tryGreeting() {
  if (!pendingGreeting || !state.idleAnimations || state.quietMode || focusing() || state.companion?.sleeping || feedingEntry || play || currentAction || !quickFeedMenu.hidden || !companionMenu.hidden || !focusMenu.hidden) return;
  pendingGreeting = false;
  const entry = YuexinContext.chooseForTag(state.customActions, 'greeting', null);
  if (entry) playAction(entry.id);
}
window.yuexin.onGreeting(() => { pendingGreeting = true; setTimeout(tryGreeting, 2200); });
function tryCelebration() {
  if (state.quietMode) { pendingCelebration = 0; return false; }
  if (!pendingCelebration || Date.now() > pendingCelebration) { pendingCelebration = 0; return false; }
  if (feedingEntry || state.feeding?.isEating || state.companion?.sleeping || play || currentAction) return false;
  pendingCelebration = 0;
  const entry = YuexinContext.chooseForTag(state.customActions, 'celebrate', previousRandomId);
  playAction(entry?.id || 'hop'); showHearts(); return true;
}
function setFocusOpen(open) {
  if (open) { setQuickFeedOpen(false); setCompanionOpen(false); stopPlay(); }
  focusMenu.hidden = !open; focusButton.setAttribute('aria-expanded', String(open)); renderFocus();
  if (open) clearTimeout(idleTimer); else scheduleIdle();
  reportActivity();
}
focusButton.onclick = () => setFocusOpen(focusMenu.hidden);
document.getElementById('focus-close').onclick = () => setFocusOpen(false);
window.yuexin.onFocusMenu(() => setFocusOpen(true));
function focusTime(remaining) {
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
}
function renderFocus(updateStatus = true) {
  const focus = state.focus || { settings: { minutes: 25, breakMinutes: 5 }, session: null };
  const session = focus.session;
  const remaining = session ? session.remainingMs : focus.settings.minutes * 60000;
  const label = session ? session.phase === 'focus' ? '专注' : '休息' : '一起专注';
  document.getElementById('focus-number').textContent = session ? Math.ceil(remaining / 60000) + '分' : '专注';
  focusButton.title = label + (session ? ' ' + focusTime(remaining) + (session.status === 'paused' ? ' · 已暂停' : '') : ' · 点击开始');
  focusButton.setAttribute('aria-label', focusButton.title);
  focusButton.classList.toggle('active', Boolean(session));
  focusButton.classList.toggle('break', session?.phase === 'break');
  focusButton.classList.toggle('paused', session?.status === 'paused');
  document.getElementById('focus-heading').textContent = label + (session?.status === 'paused' ? ' · 已暂停' : '');
  document.getElementById('focus-countdown').textContent = focusTime(remaining);
  const select = document.getElementById('quick-focus-minutes');
  select.hidden = Boolean(session);
  if (!session && select.dataset.minutes !== String(focus.settings.minutes)) {
    const options = [...new Set([25, 45, 60, focus.settings.minutes])].sort((a, b) => a - b);
    select.replaceChildren(...options.map((value) => { const option = document.createElement('option'); option.value = value; option.textContent = '专注 ' + value + ' 分钟'; return option; }));
    select.value = focus.settings.minutes; select.dataset.minutes = String(focus.settings.minutes);
  }
  const main = document.getElementById('quick-focus-main');
  main.textContent = !session ? '开始专注' : session.status === 'paused' ? '继续' : '暂停'; main.disabled = focusPending;
  const end = document.getElementById('quick-focus-end'); end.hidden = !session; end.disabled = focusPending;
  if (updateStatus) document.getElementById('quick-focus-status').textContent = !session ? '安静陪你，结束后休息 ' + focus.settings.breakMinutes + ' 分钟。' : session.phase === 'break' ? '伸个懒腰，可以一起玩一会儿～' : session.status === 'paused' ? '准备好了再继续，不着急。' : '安静陪你，结束后提醒休息。';
  fitPopover(focusMenu, 'right');
}
async function focusControl(operation) {
  if (focusPending) return;
  focusPending = true; renderFocus(false);
  try { await operation(); }
  catch (error) { document.getElementById('quick-focus-status').textContent = error.message; }
  finally { focusPending = false; renderFocus(false); }
}
document.getElementById('quick-focus-main').onclick = () => focusControl(() => state.focus?.session ? window.yuexin.toggleFocus() : window.yuexin.startFocus({ minutes: Number(document.getElementById('quick-focus-minutes').value) }));
document.getElementById('quick-focus-end').onclick = () => focusControl(() => window.yuexin.endFocus());
document.getElementById('focus-settings').onclick = () => { setFocusOpen(false); window.yuexin.openPanel('focus'); };
document.getElementById('open-journal').onclick = () => { setFocusOpen(false); window.yuexin.openPanel('journal'); };
window.yuexin.onFocusState((focus) => {
  const oldPhase = [state.focus?.session?.phase, state.focus?.session?.status].join(':'); state.focus = focus;
  if (oldPhase !== [focus.session?.phase, focus.session?.status].join(':')) { syncFocusPose(); scheduleIdle(); }
  renderFocus();
});
window.yuexin.onFocusFinished((entry) => {
  if (entry.kind === 'focus') { pendingCelebration = Date.now() + 15000; tryCelebration(); say('专注完成！休息 ' + entry.breakMinutes + ' 分钟吧～', 7000); }
  else say('休息结束啦，准备好了再开始下一段～', 6000);
  chime();
});
function syncSleeping() {
  if (state.companion?.sleeping && !feedingEntry && currentAction !== 'reminder') {
    if (currentAction !== 'sleeping') resetAction(false);
    clearTimeout(actionTimer); clearTimeout(idleTimer);
    pet.classList.add('sleeping', 'performing');
    currentAction = 'sleeping';
    const entry = interactionAction('sleep');
    const url = entry ? 'yuexin-asset://actions/' + entry.id + '.' + entry.extension : null;
    if (sleepImageUrl !== url) {
      sleepImageUrl = url;
      pet.classList.remove('custom');
      customImage.hidden = !url;
      if (url) customImage.src = url; else customImage.removeAttribute('src');
    }
  } else if (currentAction === 'sleeping') resetAction(false);
}
window.yuexin.onInteraction((result) => {
  if (result.type === 'play') stopPlay(false);
  showHearts();
  if (!state.companion?.sleeping) {
    const entry = interactionAction(result.type);
    if (entry) playAction(entry.id); else playAction(result.type === 'play' ? 'hop' : 'wiggle');
  }
  companionStatus.textContent = (result.levelUp ? '关系升级啦！' : result.completed ? '今日陪伴集齐啦！' : '心情 +' + result.moodGained + ' · 亲密 +' + result.bondGained);
  fitPopover(companionMenu, 'right');
});
async function petCat(quiet = false) {
  if (interactionPending || Date.now() < nextPettingAt) return;
  interactionPending = true; renderCompanion(false);
  try {
    await window.yuexin.petCat();
    nextPettingAt = Date.now() + 12000;
    if (!quiet) setCompanionOpen(false);
  } catch (error) {
    if (!quiet) companionStatus.textContent = error.message;
    else nextPettingAt = Date.now() + 3000;
  } finally { interactionPending = false; renderCompanion(false); }
}
document.getElementById('petting-button').onclick = () => petCat();
document.getElementById('sleep-button').onclick = async () => {
  if (interactionPending) return;
  interactionPending = true; renderCompanion(false);
  try { await window.yuexin.setSleeping(!state.companion.sleeping); setCompanionOpen(false); }
  catch (error) { companionStatus.textContent = error.message; }
  finally { interactionPending = false; renderCompanion(false); }
};
function stopPlay(cancel = true) {
  clearTimeout(playTimer); clearTimeout(playTick);
  if (play && cancel) window.yuexin.cancelPlay(play.token);
  play = null; toy.hidden = true; playHud.hidden = true;
  pet.classList.remove('playing');
  syncFocusPose();
  scheduleIdle();
}
function moveToy() {
  // Spread targets across the existing pet window; never enlarge the hit area.
  const positions = [[35, 110], [183, 150], [54, 185], [163, 92], [98, 146]];
  const target = positions[play.hits % positions.length];
  toy.style.left = target[0] + 'px'; toy.style.top = target[1] + 'px';
}
function updatePlayHud() {
  if (!play) return;
  const remaining = Math.max(0, Math.ceil((play.endsAt - Date.now()) / 1000));
  document.getElementById('play-progress').textContent = '点小球 ' + play.hits + '/3 · ' + remaining + '秒';
  playTick = setTimeout(updatePlayHud, 500);
}
document.getElementById('play-button').onclick = async () => {
  if (interactionPending || play) return;
  interactionPending = true; renderCompanion(false);
  try {
    const entry = await window.yuexin.startPlay();
    setCompanionOpen(false); setQuickFeedOpen(false); setFocusOpen(false); resetAction(false);
    play = { ...entry, hits: 0, pending: false, endsAt: Date.now() + entry.duration };
    clearTimeout(idleTimer); pet.classList.add('playing');
    toy.hidden = false; playHud.hidden = false;
    const scale = state.petScale || 1;
    playHud.style.transform = 'scale(' + 1 / scale + ')';
    playHud.style.width = Math.min(170, 260 * scale - 16) + 'px';
    playHud.style.left = 8 / scale + 'px';
    moveToy(); updatePlayHud();
    playTimer = setTimeout(() => { stopPlay(); renderCompanion(); }, entry.duration);
    reportActivity();
  } catch (error) { companionStatus.textContent = error.message; }
  finally { interactionPending = false; renderCompanion(false); }
};
toy.onclick = async () => {
  const session = play;
  if (!session || session.pending) return;
  session.pending = true;
  try {
    const result = await window.yuexin.hitToy(session.token);
    if (play !== session) return;
    play.hits = result.hits;
    if (result.finished) { stopPlay(false); renderCompanion(); }
    else { moveToy(); clearTimeout(playTick); updatePlayHud(); }
  } catch (error) { if (play === session) { stopPlay(); companionStatus.textContent = error.message; } }
  finally { session.pending = false; }
};
document.getElementById('play-cancel').onclick = () => { stopPlay(); renderCompanion(); };
for (const tab of ['reminders', 'chat', 'actions', 'settings', 'usage']) {
  const button = document.getElementById(tab === 'reminders' ? 'reminder' : tab);
  button.onclick = () => window.yuexin.openPanel(tab);
}
function render(nextState) {
  const wasFocusing = focusing();
  const wasQuiet = Boolean(state.quietMode);
  state = nextState;
  const signature = JSON.stringify([state.idleAnimations, state.quietMode, state.roaming?.isWalking, state.randomInterval, state.feeding?.isEating, state.companion?.sleeping, focusing(), YuexinContext.contextTag(state), state.customActions.map((item) => [item.id, item.random, item.tags])]);
  if (signature !== idleSignature) { idleSignature = signature; scheduleIdle(); }
  stage.style.transform = 'scale(' + (state.petScale || 1) + ')';
  pet.classList.toggle('quiet', !state.idleAnimations || state.quietMode || focusing());
  if (state.quietMode && !wasQuiet && currentAction && !['sleeping', 'focusing', 'reminder', 'feeding'].includes(currentAction) && !feedingEntry) resetAction(false);
  if (currentAction && !['sleeping', 'focusing', 'walking', 'reminder'].includes(currentAction) && !feedingEntry && !YuexinActions.some((item) => item.id === currentAction) && !state.customActions.some((item) => item.id === currentAction)) resetAction();
  if ((state.companion?.sleeping || state.feeding?.isEating || (focusing() && !wasFocusing)) && play) stopPlay();
  if (focusing() && !wasFocusing && !feedingEntry && currentAction !== 'reminder') resetAction(false);
  syncSleeping();
  syncFocusPose();
  syncWalking();
  renderQuickFeeding();
  renderCompanion();
  renderFocus();
  document.getElementById('idle-image').alt = state.petName || '月薪喵';
  reportActivity();
  const codex = state.limits.buckets.find((entry) => entry.id === 'codex') || state.limits.buckets[0];
  usage.textContent = codex?.windows[0] ? codex.windows[0].remainingPercent + '%' : '--%';
  usage.title = codex?.windows[0] ? 'Codex / Work 剩余 ' + codex.windows[0].remainingPercent + '%' : state.limits.status;
}
window.yuexin.onState(render);
window.yuexin.onAction((id) => playAction(id));
window.yuexin.onFeed((entry) => {
  stopPlay();
  setCompanionOpen(false);
  setQuickFeedOpen(false);
  setFocusOpen(false);
  resetAction(false);
  clearTimeout(idleTimer);
  feedingEntry = { ...entry };
  currentAction = 'feeding';
  pet.classList.add('performing');
  customImage.src = entry.url + '?t=' + Date.now();
  customImage.hidden = false;
  if (entry.result) showHearts();
  reportActivity();
});
window.yuexin.onReminder((title) => {
  stopPlay(); setCompanionOpen(false); setQuickFeedOpen(false); setFocusOpen(false);
  resetAction(false);
  currentAction = 'reminder';
  pet.classList.add('performing');
  if (!state.quietMode) { pet.classList.add('alarm'); effect.textContent = '⏰'; }
  say('提醒时间到：' + title, 9000);
  actionTimer = setTimeout(resetAction, 3200);
  chime();
  reportActivity();
});
function chime() {
  if (state.quietMode) return;
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
}
window.yuexin.getState().then(render);
