const pet = document.getElementById('pet');
const stage = document.getElementById('stage');
const bubble = document.getElementById('bubble');
const effect = document.getElementById('effect');
const usage = document.getElementById('usage');
const customImage = document.getElementById('custom-animation');
let drag = null;
let actionTimer;
let bubbleTimer;
let state = { idleAnimations: true, customActions: [] };
let currentAction = null;
let idleTimer;
let idleSignature;
let previousRandomId;

function scheduleIdle() {
  clearTimeout(idleTimer);
  if (!state.idleAnimations) return;
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
  currentAction = null;
  pet.className = 'pet' + (state.idleAnimations ? '' : ' quiet');
  customImage.hidden = true;
  customImage.removeAttribute('src');
  effect.textContent = '';
  scheduleIdle();
}
function playAction(id) {
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
  actionTimer = setTimeout(resetAction, entry?.duration || 5000);
};
customImage.onerror = () => { resetAction(); say('这个动作图片无法打开，请重新导入。', 4000); };
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
  if (!drag.moved) resetAction();
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
for (const tab of ['reminders', 'chat', 'actions', 'settings', 'usage']) {
  const button = document.getElementById(tab === 'reminders' ? 'reminder' : tab);
  button.onclick = () => window.yuexin.openPanel(tab);
}
function render(nextState) {
  state = nextState;
  const signature = JSON.stringify([state.idleAnimations, state.randomInterval, state.customActions.map((item) => [item.id, item.random])]);
  if (signature !== idleSignature) { idleSignature = signature; scheduleIdle(); }
  stage.style.transform = 'scale(' + (state.petScale || 1) + ')';
  pet.classList.toggle('quiet', !state.idleAnimations);
  if (currentAction && !YuexinActions.some((item) => item.id === currentAction) && !state.customActions.some((item) => item.id === currentAction)) resetAction();
  const codex = state.limits.buckets.find((entry) => entry.id === 'codex') || state.limits.buckets[0];
  usage.textContent = codex?.windows[0] ? codex.windows[0].remainingPercent + '%' : '--%';
  usage.title = codex?.windows[0] ? 'Codex / Work 剩余 ' + codex.windows[0].remainingPercent + '%' : state.limits.status;
}
window.yuexin.onState(render);
window.yuexin.onAction((id) => playAction(id));
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
