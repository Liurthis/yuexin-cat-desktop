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

function scheduleIdle() {
  clearTimeout(idleTimer);
  if (!state.idleAnimations || feedingEntry || state.feeding?.isEating || state.companion?.sleeping || play || !quickFeedMenu.hidden || !companionMenu.hidden) return;
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
  pet.className = 'pet' + (state.idleAnimations ? '' : ' quiet');
  customImage.hidden = true;
  customImage.removeAttribute('src');
  effect.textContent = '';
  sleepImageUrl = null;
  if (resumeSleep) syncSleeping();
  scheduleIdle();
}
function playAction(id) {
  if (feedingEntry || state.feeding?.isEating || state.companion?.sleeping || play) return;
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
  if (currentAction === 'sleeping') return;
  const entry = state.customActions.find((item) => item.id === currentAction);
  actionTimer = setTimeout(resetAction, feedingEntry?.duration || entry?.duration || 5000);
};
customImage.onerror = () => {
  if (currentAction === 'sleeping') {
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
  const entry = YuexinLibrary.chooseRandomAction(state.customActions, YuexinActions, previousRandomId);
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
});
pet.addEventListener('pointercancel', () => { drag = null; window.yuexin.setPetDragging(false); pet.classList.remove('dragging'); });
pet.addEventListener('pointermove', (event) => {
  if (drag || play || feedingEntry || state.feeding?.isEating || state.companion?.sleeping || Date.now() < nextPettingAt || !companionMenu.hidden || !quickFeedMenu.hidden) { strokes.reset(); return; }
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
  const preferredTop = menu === companionMenu ? 123 : 75;
  if (!menu.hidden) menu.style.top = Math.max(3, Math.min(preferredTop * scale, 285 * scale - menu.offsetHeight - 5)) / scale + 'px';
}
function setQuickFeedOpen(open) {
  if (open) { setCompanionOpen(false); stopPlay(); }
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
  if (!companionMenu.hidden && !companionMenu.contains(event.target) && !moodButton.contains(event.target)) setCompanionOpen(false);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { setQuickFeedOpen(false); setCompanionOpen(false); stopPlay(); } });
window.addEventListener('blur', () => { setQuickFeedOpen(false); setCompanionOpen(false); });
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
  if (open) { setQuickFeedOpen(false); stopPlay(); }
  companionMenu.hidden = !open;
  moodButton.setAttribute('aria-expanded', String(open));
  renderCompanion();
  if (open) clearTimeout(idleTimer); else scheduleIdle();
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
  document.getElementById('mood-label').textContent = emotion.emoji + ' ' + emotion.name + ' · ' + mood;
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
  if (kind === 'sleep') return state.customActions.find((entry) => /睡觉|睡眠|困困/.test(entry.name) || entry.id === '9e1049df-cbf2-4eae-a93e-180cf5766f2b') || null;
  const name = kind === 'petting' ? '爱你' : '喜欢';
  return state.customActions.find((entry) => entry.name === name) || null;
}
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
    setCompanionOpen(false); setQuickFeedOpen(false); resetAction();
    play = { ...entry, hits: 0, pending: false, endsAt: Date.now() + entry.duration };
    clearTimeout(idleTimer); pet.classList.add('playing');
    toy.hidden = false; playHud.hidden = false;
    const scale = state.petScale || 1;
    playHud.style.transform = 'scale(' + 1 / scale + ')';
    playHud.style.width = Math.min(170, 260 * scale - 16) + 'px';
    playHud.style.left = 8 / scale + 'px';
    moveToy(); updatePlayHud();
    playTimer = setTimeout(() => { stopPlay(); renderCompanion(); }, entry.duration);
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
  state = nextState;
  const signature = JSON.stringify([state.idleAnimations, state.randomInterval, state.feeding?.isEating, state.companion?.sleeping, state.customActions.map((item) => [item.id, item.random])]);
  if (signature !== idleSignature) { idleSignature = signature; scheduleIdle(); }
  stage.style.transform = 'scale(' + (state.petScale || 1) + ')';
  pet.classList.toggle('quiet', !state.idleAnimations);
  if (currentAction && !['sleeping', 'reminder'].includes(currentAction) && !feedingEntry && !YuexinActions.some((item) => item.id === currentAction) && !state.customActions.some((item) => item.id === currentAction)) resetAction();
  if ((state.companion?.sleeping || state.feeding?.isEating) && play) stopPlay();
  syncSleeping();
  renderQuickFeeding();
  renderCompanion();
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
  resetAction();
  clearTimeout(idleTimer);
  feedingEntry = { ...entry };
  currentAction = 'feeding';
  pet.classList.add('performing');
  customImage.src = entry.url + '?t=' + Date.now();
  customImage.hidden = false;
  if (entry.result) showHearts();
});
window.yuexin.onReminder((title) => {
  stopPlay(); setCompanionOpen(false); setQuickFeedOpen(false);
  resetAction(false);
  currentAction = 'reminder';
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
