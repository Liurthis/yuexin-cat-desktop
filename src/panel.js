const tabs = [...document.querySelectorAll('.tabs button')];
const pages = [...document.querySelectorAll('.page')];
const list = document.getElementById('reminder-list');
const limitList = document.getElementById('limit-list');
const limitStatus = document.getElementById('limit-status');
let currentState;
let feedPending = false;
let feedingImageSignature;
let interactionImageSignature;
let focusPending = false;
let actionSignature;
let journalSignature;
const petNameInput = document.getElementById('pet-name');
let petNameDirty = false;
let petNamePending = false;
let roamingPending = false;
let quietPending = false;
let homePending = false;

function selectTab(name) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  pages.forEach((page) => page.classList.toggle('active', page.id === name));
}
tabs.forEach((tab) => tab.onclick = () => selectTab(tab.dataset.tab));
window.yuexin.onTab(selectTab);

function dateText(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function renderReminders(items) {
  list.replaceChildren();
  if (!items.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '还没有提醒，给月薪喵安排一个吧～'; list.append(empty); return; }
  items.forEach((item) => {
    const card = document.createElement('div'); card.className = `card reminder${item.enabled ? '' : ' off'}`;
    const icon = document.createElement('div'); icon.className = 'symbol'; icon.textContent = item.repeat === 'daily' ? '🔁' : '⏰';
    const details = document.createElement('div'); details.className = 'details';
    const title = document.createElement('strong'); title.textContent = item.title;
    const meta = document.createElement('small'); meta.textContent = `${item.repeat === 'daily' ? '每天 · ' : ''}${dateText(item.nextAt)}${item.enabled ? '' : ' · 已暂停'}`;
    details.append(title, meta);
    const toggle = document.createElement('button'); toggle.textContent = item.enabled ? '⏸' : '▶'; toggle.title = item.enabled ? '暂停' : '开启'; toggle.onclick = () => window.yuexin.toggleReminder(item.id);
    const remove = document.createElement('button'); remove.textContent = '×'; remove.title = '删除'; remove.onclick = () => window.yuexin.deleteReminder(item.id);
    card.append(icon, details, toggle, remove); list.append(card);
  });
}

function renderLimits(limits) {
  limitList.replaceChildren();
  limitStatus.textContent = limits.status + (limits.updatedAt ? ` · ${new Date(limits.updatedAt).toLocaleTimeString('zh-CN')}` : '');
  document.getElementById('connect-account').hidden = limits.buckets.length > 0;
  document.getElementById('connect-hint').hidden = limits.buckets.length > 0;
  if (!limits.buckets.length) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '暂无可显示的账户额度。请确认本机 Codex 已登录 ChatGPT。'; limitList.append(empty); return;
  }
  limits.buckets.forEach((bucket) => {
    const card = document.createElement('div'); card.className = 'card limit-card';
    const header = document.createElement('div'); header.className = 'limit-head';
    const name = document.createElement('strong'); name.textContent = bucket.name;
    const label = document.createElement('span'); label.textContent = '剩余用量'; header.append(name, label); card.append(header);
    bucket.windows.forEach((window) => {
      const box = document.createElement('div'); box.className = 'window';
      const line = document.createElement('div'); line.className = 'window-label';
      const duration = document.createElement('span'); duration.textContent = window.durationMins >= 10080 ? '每周额度' : window.durationMins >= 60 ? `${Math.round(window.durationMins / 60)} 小时额度` : `${window.durationMins} 分钟额度`;
      const percent = document.createElement('b'); percent.textContent = `${window.remainingPercent}%`;
      line.append(duration, percent);
      const track = document.createElement('div'); track.className = 'meter'; const fill = document.createElement('span'); fill.style.width = `${window.remainingPercent}%`; track.append(fill);
      const reset = document.createElement('div'); reset.className = 'reset'; reset.textContent = window.resetsAt ? `重置：${dateText(window.resetsAt * 1000)}` : '重置时间未知';
      box.append(line, track, reset); card.append(box);
    });
    limitList.append(card);
  });
}

function render(state) {
  currentState = state;
  renderIdentity(state.petName);
  renderHabits(state);
  renderReminders(state.reminders);
  renderLimits(state.limits);
  document.getElementById('always-on-top').checked = state.alwaysOnTop;
  document.getElementById('auto-start').checked = state.autoStart;
  document.getElementById('idle-animations').checked = state.idleAnimations;
  document.getElementById('random-interval').value = state.randomInterval;
  document.getElementById('pet-scale').value = Math.round(state.petScale * 100);
  document.getElementById('size-value').textContent = Math.round(state.petScale * 100) + '%';
  renderActions(state.customActions);
  renderFeeding(state.feeding);
  renderCompanion(state.companion);
  renderFocus(state.focus);
  renderJournal(state.journal);
}
window.yuexin.onState(render);
window.yuexin.getState().then(render);

function petName() {
  return currentState?.petName || '月薪喵';
}

function renderIdentity(name = '月薪喵') {
  document.getElementById('pet-home-title').textContent = name + '的小窝';
  document.getElementById('journal-title').textContent = name + '的陪伴日记';
  document.title = name + '的小窝';
}

function habitStatus(id, text, failure = false) {
  const status = document.getElementById(id);
  status.textContent = text;
  status.classList.toggle('failure', failure);
}

function renderHabits(state) {
  if (!petNameDirty && !petNamePending && document.activeElement !== petNameInput) petNameInput.value = state.petName || '月薪喵';
  document.getElementById('pet-name-count').textContent = Array.from(petNameInput.value).length + ' / 12';
  petNameInput.disabled = petNamePending;
  document.getElementById('save-pet-name').disabled = petNamePending;
  const roaming = state.roaming || { enabled: false, intervalSeconds: 300, speed: 'slow', isWalking: false };
  const enabled = document.getElementById('roaming-enabled');
  const interval = document.getElementById('roaming-interval');
  const speed = document.getElementById('roaming-speed');
  if (!roamingPending) {
    enabled.checked = roaming.enabled;
    interval.value = roaming.intervalSeconds;
    speed.value = roaming.speed;
  }
  enabled.disabled = roamingPending;
  interval.disabled = roamingPending;
  speed.disabled = roamingPending;
  document.getElementById('call-home').disabled = homePending;
  document.getElementById('roaming-state').textContent = roaming.isWalking ? '正在附近散步～' : roaming.awayFromHome ? '等互动结束，再回小窝' : state.quietMode ? '安静陪在小窝里' : roaming.enabled ? '等空闲时走走' : '在小窝里陪你';
  const quiet = document.getElementById('quiet-mode');
  if (!quietPending) quiet.checked = Boolean(state.quietMode);
  quiet.disabled = quietPending;
}

petNameInput.oninput = (event = {}) => {
  petNameDirty = true;
  const characters = Array.from(petNameInput.value);
  if (!event.isComposing && characters.length > 12) petNameInput.value = characters.slice(0, 12).join('');
  document.getElementById('pet-name-count').textContent = Array.from(petNameInput.value).length + ' / 12';
  habitStatus('pet-name-status', '');
};
petNameInput.oncompositionend = () => petNameInput.oninput();
document.getElementById('pet-name-form').onsubmit = async (event) => {
  event.preventDefault();
  if (!currentState || petNamePending) return;
  const draft = petNameInput.value.trim();
  if (Array.from(draft).length > 12) { habitStatus('pet-name-status', '昵称最多 12 个字或表情。', true); return; }
  petNamePending = true; renderHabits(currentState); habitStatus('pet-name-status', '');
  try {
    const saved = await window.yuexin.setPetName(draft);
    currentState.petName = typeof saved === 'string' && saved ? saved : draft || '月薪喵';
    petNameDirty = false;
    petNameInput.value = currentState.petName;
    renderIdentity(currentState.petName);
    renderFocus(currentState.focus);
    habitStatus('pet-name-status', '昵称已保存，现在叫它“' + currentState.petName + '”。');
  } catch (error) { habitStatus('pet-name-status', error.message, true); }
  finally { petNamePending = false; renderHabits(currentState); }
};

async function changeRoaming(patch) {
  if (!currentState || roamingPending) return;
  roamingPending = true; renderHabits(currentState); habitStatus('roaming-status', '');
  try {
    await window.yuexin.setRoaming(patch);
    currentState.roaming = { ...currentState.roaming, ...patch };
    habitStatus('roaming-status', patch.enabled === false ? '已关闭自动散步。' : currentState.quietMode && currentState.roaming.enabled ? '习惯已保存，关闭安静陪伴后会再出门走走。' : '散步习惯已保存。');
  } catch (error) { habitStatus('roaming-status', error.message, true); }
  finally { roamingPending = false; renderHabits(currentState); }
}
document.getElementById('roaming-enabled').onchange = (event) => changeRoaming({ enabled: event.target.checked });
document.getElementById('roaming-interval').onchange = (event) => changeRoaming({ intervalSeconds: Number(event.target.value) });
document.getElementById('roaming-speed').onchange = (event) => changeRoaming({ speed: event.target.value });
document.getElementById('quiet-mode').onchange = async (event) => {
  if (!currentState || quietPending) return;
  const enabled = event.target.checked;
  quietPending = true; renderHabits(currentState); habitStatus('quiet-mode-status', '');
  try {
    await window.yuexin.setQuietMode(enabled);
    currentState.quietMode = enabled;
    habitStatus('quiet-mode-status', enabled ? '已开启安静陪伴，提醒仍会正常显示。' : '已恢复平时的陪伴习惯。');
  } catch (error) { habitStatus('quiet-mode-status', error.message, true); }
  finally { quietPending = false; renderHabits(currentState); }
};
document.getElementById('call-home').onclick = async () => {
  if (!currentState || homePending) return;
  homePending = true; renderHabits(currentState); habitStatus('roaming-status', '');
  try { await window.yuexin.callHome(); habitStatus('roaming-status', '已经叫它回小窝了。'); }
  catch (error) { habitStatus('roaming-status', error.message, true); }
  finally { homePending = false; renderHabits(currentState); }
};

function renderFocus(focus) {
  if (!focus) return;
  const session = focus.session;
  const seconds = Math.max(0, Math.ceil((session?.remainingMs ?? focus.settings.minutes * 60000) / 1000));
  document.getElementById('panel-focus-countdown').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  document.getElementById('panel-focus-heading').textContent = session ? (session.phase === 'focus' ? petName() + '正在陪你专注' : '一起休息一下') + (session.status === 'paused' ? ' · 已暂停' : '') : '准备开始';
  document.getElementById('panel-focus-fill').style.width = (session?.progress || 0) + '%';
  document.getElementById('panel-focus-meter').setAttribute('aria-valuenow', session?.progress || 0);
  const main = document.getElementById('panel-focus-main');
  main.textContent = !session ? '开始专注' : session.status === 'paused' ? '继续' : '暂停'; main.disabled = focusPending;
  const end = document.getElementById('panel-focus-end'); end.hidden = !session; end.disabled = focusPending;
  if (!focusPending) document.getElementById('panel-focus-status').textContent = !session ? '结束后提醒休息，完成的时间会记在日记里。' : session.phase === 'break' ? '喝口水、伸伸懒腰，再开始下一段。' : session.status === 'paused' ? '准备好后继续，暂停时间不会计入。' : '一次只做一件事，我在这里陪你。';
  for (const [id, key] of [['focus-minutes', 'minutes'], ['focus-break-minutes', 'breakMinutes']]) {
    const input = document.getElementById(id);
    if (input.dataset.saved !== String(focus.settings[key])) {
      if (document.activeElement !== input) input.value = focus.settings[key];
      input.dataset.saved = String(focus.settings[key]);
    }
  }
}
window.yuexin.onFocusState((focus) => { if (currentState) { currentState.focus = focus; renderFocus(focus); } });
async function focusControl(operation) {
  if (focusPending) return;
  focusPending = true; renderFocus(currentState.focus);
  let failure;
  try { currentState.focus = await operation(); }
  catch (error) { failure = error.message; }
  finally { focusPending = false; renderFocus(currentState.focus); if (failure) document.getElementById('panel-focus-status').textContent = failure; }
}
document.getElementById('panel-focus-main').onclick = () => focusControl(() => currentState.focus.session ? window.yuexin.toggleFocus() : window.yuexin.startFocus({ minutes: Number(document.getElementById('focus-minutes').value), breakMinutes: Number(document.getElementById('focus-break-minutes').value) }));
document.getElementById('panel-focus-end').onclick = () => focusControl(() => window.yuexin.endFocus());
document.getElementById('focus-settings-form').onsubmit = async (event) => {
  event.preventDefault();
  try { await window.yuexin.setFocusSettings({ minutes: Number(document.getElementById('focus-minutes').value), breakMinutes: Number(document.getElementById('focus-break-minutes').value) }); document.getElementById('focus-settings-status').textContent = '已保存，下次开始时使用新的时长。'; }
  catch (error) { document.getElementById('focus-settings-status').textContent = error.message; }
};
document.getElementById('focus-open-journal').onclick = () => selectTab('journal');
function renderJournal(journal) {
  if (!journal || journalSignature === JSON.stringify(journal)) return;
  journalSignature = JSON.stringify(journal);
  const total = journal.totals;
  document.getElementById('journal-totals').textContent = '🐟 喂食 ' + total.feed + ' 次 · 🤲 摸摸 ' + total.petting + ' 次 · 🧶 逗猫 ' + total.play + ' 局\n⌛ 一起完成 ' + total.focus + ' 段专注，共 ' + total.focusMinutes + ' 分钟';
  const badges = document.getElementById('journal-badges'); badges.replaceChildren();
  for (const badge of journal.badges) {
    const card = document.createElement('div'); card.className = 'badge' + (badge.earnedAt ? ' earned' : '');
    const title = document.createElement('strong'); title.textContent = badge.emoji + ' ' + badge.name;
    const detail = document.createElement('small'); detail.textContent = badge.earnedAt ? '已获得 · ' + dateText(badge.earnedAt) : badge.description;
    card.append(title, detail); badges.append(card);
  }
  const list = document.getElementById('journal-days');
  const opened = new Set([...list.querySelectorAll('details[open]')].map((item) => item.dataset.date));
  list.replaceChildren();
  if (!journal.days.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '今天先摸摸我的头，写下我们的第一件小事吧～'; list.append(empty); }
  for (const [index, day] of journal.days.entries()) {
    const card = document.createElement('details'); card.className = 'card journal-day'; card.dataset.date = day.date; card.open = opened.has(day.date) || index === 0;
    const summary = document.createElement('summary');
    const date = document.createElement('strong'); date.textContent = day.date;
    const text = document.createElement('p'); text.textContent = day.summary;
    const snapshot = document.createElement('small'); snapshot.textContent = '最近一次互动 · 心情 ' + day.mood + ' · 亲密度 ' + day.bond;
    summary.append(date, text, snapshot); card.append(summary);
    for (const entry of [...day.entries].reverse()) {
      const row = document.createElement('div'); row.className = 'journal-entry';
      const time = document.createElement('time'); time.dateTime = new Date(entry.at).toISOString(); time.textContent = new Date(entry.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const text = document.createElement('span'); text.textContent = entry.text; row.append(time, text); card.append(row);
    }
    list.append(card);
  }
}
document.getElementById('export-journal').onclick = async (event) => {
  event.target.disabled = true;
  try { if (await window.yuexin.exportJournal()) document.getElementById('journal-status').textContent = '日记已导出为文本，可以留作纪念。'; }
  catch (error) { document.getElementById('journal-status').textContent = error.message; }
  finally { event.target.disabled = false; }
};

function renderFeeding(feeding) {
  const value = feeding.satiety;
  document.getElementById('satiety-value').textContent = value + ' / 100';
  document.getElementById('satiety-fill').style.width = value + '%';
  const meter = document.getElementById('satiety-meter');
  meter.setAttribute('aria-valuenow', value);
  meter.classList.toggle('hungry', value <= 25);
  document.getElementById('satiety-mood').textContent = feeding.isEating ? '正在认真吃饭，等一小会儿～' : value >= 100 ? '已经饱饱的啦，等肚子空一点再喂吧～' : value <= 25 ? '小肚子有点空了，来点好吃的吧～' : value >= 70 ? '吃得刚刚好，心情也很好～' : '再来一点小鱼干也不错～';
  const foodList = document.getElementById('food-list');
  if (!foodList.children.length) feeding.foods.forEach((food) => {
    const button = document.createElement('button'); button.className = 'food-card'; button.dataset.food = food.id;
    const icon = document.createElement('span'); icon.className = 'food-icon'; icon.textContent = food.emoji;
    const name = document.createElement('strong'); name.textContent = food.name;
    const amount = document.createElement('small'); amount.textContent = '饱腹度 +' + food.amount;
    button.append(icon, name, amount); button.onclick = () => feed(food.id); foodList.append(button);
  });
  [...foodList.children].forEach((button) => {
    button.disabled = feedPending || feeding.isEating || value >= 100;
    button.classList.toggle('favorite', button.dataset.food === currentState.companion?.favoriteFood);
    button.title = '心情 +' + ((button.dataset.food === 'snack' ? 7 : 4) + (button.dataset.food === currentState.companion?.favoriteFood ? 3 : 0));
  });
  const select = document.getElementById('feeding-image-select');
  const signature = JSON.stringify([feeding.image.url, currentState.customActions.map((entry) => [entry.id, entry.name])]);
  if (feedingImageSignature !== signature) {
    feedingImageSignature = signature;
    const options = [{ value: 'preset', name: '吃冰淇淋（预设）' }];
    if (!feeding.image.preset) options.push({ value: 'current', name: '当前：' + feeding.image.name });
    currentState.customActions.forEach((entry) => options.push({ value: entry.id, name: entry.name }));
    select.replaceChildren(...options.map((entry) => { const option = document.createElement('option'); option.value = entry.value; option.textContent = entry.name; return option; }));
    select.value = feeding.image.preset ? 'preset' : 'current';
    document.getElementById('feeding-preview').src = feeding.image.url;
    document.getElementById('feeding-image-name').textContent = feeding.image.name;
  }
  const duration = document.getElementById('feeding-duration');
  if (document.activeElement !== duration) duration.value = feeding.duration / 1000;
  for (const id of ['feeding-image-select', 'feeding-import-image', 'feeding-reset-image', 'feeding-duration']) document.getElementById(id).disabled = feeding.isEating;
}

function renderCompanion(companion) {
  if (!companion) return;
  document.getElementById('panel-mood-name').textContent = companion.emotion.emoji + ' ' + companion.emotion.name;
  document.getElementById('panel-mood-value').textContent = companion.mood + ' / 100';
  document.getElementById('panel-mood-fill').style.width = companion.mood + '%';
  document.getElementById('panel-mood-meter').setAttribute('aria-valuenow', companion.mood);
  document.getElementById('panel-bond').textContent = companion.level.name + ' · 亲密度 ' + companion.bond + (companion.level.next ? ' · 距离「' + companion.level.next + '」还差 ' + companion.level.remaining : ' · 已经是家人啦');
  document.getElementById('panel-bond-fill').style.width = companion.level.progress + '%';
  document.getElementById('panel-bond-meter').setAttribute('aria-valuenow', companion.level.progress);
  const tasks = document.getElementById('daily-tasks');
  tasks.replaceChildren(...[['feed', '🐟 喂食'], ['petting', '🤲 摸摸'], ['play', '🧶 逗猫']].map(([key, label]) => {
    const item = document.createElement('span'); item.className = companion.daily[key] ? 'done' : ''; item.textContent = label + (companion.daily[key] ? ' ✓' : ''); return item;
  }));
  const food = currentState.feeding.foods.find((entry) => entry.id === companion.favoriteFood);
  document.getElementById('panel-companion-hint').textContent = '一起度过 ' + companion.daysTogether + ' 天 · 今天最爱' + food.name + '（心情额外 +3）。集齐三种陪伴奖励心情 +5、亲密度 +5；每天最多增加 30 亲密度，离线不会减少。';
  const signature = JSON.stringify([companion.animations, currentState.customActions.map((entry) => [entry.id, entry.name])]);
  if (signature !== interactionImageSignature) {
    interactionImageSignature = signature;
    for (const kind of ['petting', 'play', 'sleep']) {
      const select = document.getElementById(kind + '-animation');
      const options = [{ id: 'auto', name: '自动选择合适的 GIF' }, { id: 'original', name: '原图回应（轻动画）' }, ...currentState.customActions];
      const selected = companion.animations[kind];
      if (!options.some((entry) => entry.id === selected)) options.push({ id: selected, name: '动作已移除（自动使用预设）' });
      select.replaceChildren(...options.map((entry) => { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name; return option; }));
      select.value = selected;
    }
  }
}
for (const kind of ['petting', 'play', 'sleep']) {
  document.getElementById(kind + '-animation').onchange = async (event) => {
    const status = document.getElementById('interaction-image-status');
    event.target.disabled = true;
    try { await window.yuexin.setInteractionAnimation(kind, event.target.value); status.textContent = '陪伴动作已保存。'; }
    catch (error) { status.textContent = error.message; interactionImageSignature = undefined; renderCompanion(currentState.companion); }
    finally { event.target.disabled = false; }
  };
}

async function feed(foodId) {
  const status = document.getElementById('feeding-status');
  if (feedPending) return;
  feedPending = true; renderFeeding(currentState.feeding);
  try {
    const result = await window.yuexin.feed(foodId);
    status.textContent = '喂了' + result.food.name + '，饱腹度 +' + result.gained + '，心情 +' + result.companion.moodGained + (result.companion.favorite ? '（今天最爱！）' : '') + '。';
  } catch (error) { status.textContent = error.message; }
  finally { feedPending = false; renderFeeding(currentState.feeding); }
}
document.getElementById('feeding-open-settings').onclick = () => { selectTab('settings'); document.getElementById('feeding-image-select').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
async function changeFeedingImage(action) {
  const status = document.getElementById('feeding-image-status'); status.textContent = '';
  try { if (await action() !== false) status.textContent = '吃饭动作已保存，下次喂食时就会播放。'; }
  catch (error) { status.textContent = error.message; }
  finally { feedingImageSignature = undefined; renderFeeding(currentState.feeding); }
}
document.getElementById('feeding-image-select').onchange = (event) => { if (event.target.value !== 'current') changeFeedingImage(() => window.yuexin.setFeedingImage(event.target.value)); };
document.getElementById('feeding-import-image').onclick = () => changeFeedingImage(() => window.yuexin.importFeedingImage());
document.getElementById('feeding-reset-image').onclick = () => changeFeedingImage(() => window.yuexin.setFeedingImage('preset'));
document.getElementById('feeding-duration').onchange = async (event) => {
  try { await window.yuexin.setFeedingDuration(Number(event.target.value)); }
  catch (error) { document.getElementById('feeding-image-status').textContent = error.message; }
};

const repeat = document.getElementById('reminder-repeat');
repeat.onchange = () => {
  document.getElementById('once-field').hidden = repeat.value === 'daily';
  document.getElementById('daily-field').hidden = repeat.value !== 'daily';
};
const timeInput = document.getElementById('reminder-time');
const initialTime = new Date(Date.now() + 5 * 60000);
timeInput.value = `${initialTime.getFullYear()}-${String(initialTime.getMonth()+1).padStart(2,'0')}-${String(initialTime.getDate()).padStart(2,'0')}T${String(initialTime.getHours()).padStart(2,'0')}:${String(initialTime.getMinutes()).padStart(2,'0')}`;
document.getElementById('reminder-form').onsubmit = async (event) => {
  event.preventDefault();
  const error = document.getElementById('reminder-error'); error.textContent = '';
  try {
    await window.yuexin.addReminder({
      title: document.getElementById('reminder-title').value,
      repeat: repeat.value,
      time: document.getElementById('daily-time').value,
      timestamp: new Date(timeInput.value).getTime(),
    });
    document.getElementById('reminder-title').value = '';
  } catch (cause) { error.textContent = cause.message; }
};
document.getElementById('refresh-limits').onclick = () => window.yuexin.refreshLimits();
document.getElementById('connect-account').onclick = async () => {
  try { await window.yuexin.connectAccount(); limitStatus.textContent = '请在浏览器中完成登录，然后返回这里。'; }
  catch (error) { limitStatus.textContent = `登录未启动：${error.message}`; }
};
document.getElementById('select-codex').onclick = async () => {
  try { await window.yuexin.selectCodexProgram(); }
  catch (error) { limitStatus.textContent = error.message; }
};
document.getElementById('always-on-top').onchange = (event) => window.yuexin.setAlwaysOnTop(event.target.checked);
document.getElementById('auto-start').onchange = async (event) => {
  const checkbox = event.target;
  const status = document.getElementById('startup-status');
  checkbox.disabled = true; status.textContent = '';
  try {
    const enabled = await window.yuexin.setAutoStart(checkbox.checked);
    checkbox.checked = enabled;
    status.textContent = enabled ? '已开启，下次登录 Windows 时会自动出现。' : '已关闭开机自启动。';
  } catch (error) { checkbox.checked = currentState?.autoStart || false; status.textContent = error.message; }
  finally { checkbox.disabled = false; }
};
document.getElementById('idle-animations').onchange = (event) => window.yuexin.setIdleAnimations(event.target.checked);
document.getElementById('random-interval').onchange = (event) => window.yuexin.setRandomInterval(Number(event.target.value));
const scaleInput = document.getElementById('pet-scale');
let scaleTimer;
scaleInput.oninput = () => {
  document.getElementById('size-value').textContent = scaleInput.value + '%';
  clearTimeout(scaleTimer);
  scaleTimer = setTimeout(() => window.yuexin.setPetScale(Number(scaleInput.value) / 100), 60);
};
scaleInput.onchange = () => { clearTimeout(scaleTimer); window.yuexin.setPetScale(Number(scaleInput.value) / 100); };
document.getElementById('reset-size').onclick = () => { clearTimeout(scaleTimer); window.yuexin.setPetScale(1); };
function renderActions(custom) {
  const signature = JSON.stringify(custom);
  if (actionSignature === signature) return;
  actionSignature = signature;
  const builtins = document.getElementById('action-list');
  if (!builtins.children.length) YuexinActions.forEach((entry) => {
    const button = document.createElement('button'); button.className = 'action-card';
    const emoji = document.createElement('span'); emoji.className = 'action-emoji'; emoji.textContent = entry.emoji;
    const title = document.createElement('strong'); title.textContent = entry.name;
    const detail = document.createElement('small'); detail.textContent = entry.description;
    button.append(emoji, title, detail); button.onclick = () => window.yuexin.playAction(entry.id);
    builtins.append(button);
  });
  const customList = document.getElementById('custom-action-list');
  const opened = new Set([...customList.querySelectorAll('details[open]')].map((item) => item.dataset.id));
  customList.replaceChildren();
  const enabledCount = custom.filter((item) => item.random !== false).length;
  document.getElementById('random-action-count').textContent = `共 ${custom.length} 个图片动作 · ${enabledCount} 个参与随机播放`;
  if (!custom.length) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '把喜欢的月薪猫 GIF 加进来，动作库可以不断扩充～'; customList.append(empty);
  }
  custom.forEach((entry) => {
    const row = document.createElement('div'); row.className = 'card image-action';
    const preview = document.createElement('img'); preview.className = 'action-preview'; preview.alt = entry.name; preview.loading = 'lazy'; preview.src = `yuexin-asset://actions/${entry.id}.${entry.extension}`;
    const name = document.createElement('div'); name.className = 'action-details';
    const title = document.createElement('strong'); title.textContent = entry.name;
    const controls = document.createElement('div'); controls.className = 'action-controls';
    const randomLabel = document.createElement('label'); randomLabel.className = 'random-label';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = entry.random !== false; checkbox.onchange = () => window.yuexin.updateAction(entry.id, { random: checkbox.checked });
    randomLabel.append(checkbox, document.createTextNode('参与随机'));
    const durationLabel = document.createElement('label'); durationLabel.className = 'duration-label'; durationLabel.textContent = '播放';
    const duration = document.createElement('input'); duration.type = 'number'; duration.min = 2; duration.max = 120; duration.value = entry.duration / 1000; duration.setAttribute('aria-label', entry.name + '播放秒数'); duration.onchange = () => window.yuexin.updateAction(entry.id, { duration: Number(duration.value) });
    durationLabel.append(duration, document.createTextNode('秒'));
    controls.append(randomLabel, durationLabel); name.append(title, controls);
    const tags = YuexinContext.normalizeTags(entry);
    const purposes = document.createElement('details'); purposes.className = 'action-tags'; purposes.dataset.id = entry.id; purposes.open = opened.has(entry.id);
    const summary = document.createElement('summary'); summary.textContent = '用途：' + (YuexinContext.TAGS.filter((tag) => tags.includes(tag.id)).map((tag) => tag.name).join('、') || '仅手动播放');
    const choices = document.createElement('div'); choices.className = 'tag-options';
    for (const tag of YuexinContext.TAGS) {
      const label = document.createElement('label'); const check = document.createElement('input'); check.type = 'checkbox'; check.value = tag.id; check.checked = tags.includes(tag.id);
      check.onchange = async () => {
        try { await window.yuexin.updateAction(entry.id, { tags: [...choices.querySelectorAll('input:checked')].map((input) => input.value) }); }
        catch (error) { document.getElementById('action-status').textContent = error.message; actionSignature = undefined; renderActions(currentState.customActions); }
      };
      label.append(check, document.createTextNode(tag.emoji + ' ' + tag.name)); choices.append(label);
    }
    purposes.append(summary, choices); name.append(purposes);
    const buttons = document.createElement('div'); buttons.className = 'action-buttons';
    const play = document.createElement('button'); play.className = 'secondary'; play.textContent = '▶'; play.title = '播放'; play.onclick = () => window.yuexin.playAction(entry.id);
    const remove = document.createElement('button'); remove.className = 'remove-action'; remove.textContent = '×'; remove.title = '移除动作'; remove.onclick = () => window.yuexin.removeAction(entry.id);
    buttons.append(play, remove); row.append(preview, name, buttons); customList.append(row);
  });
}
document.getElementById('import-action').onclick = async () => {
  const status = document.getElementById('action-status');
  const button = document.getElementById('import-action'); button.disabled = true; status.textContent = '';
  try {
    const result = await window.yuexin.importAction(Number(document.getElementById('action-duration').value));
    if (result) {
      status.textContent = (result.entries.length ? `已添加 ${result.entries.length} 个动作，已加入随机播放。` : '') + (result.errors.length ? '\n' + result.errors.join('\n') : '');
      if (result.entries.length) await window.yuexin.playAction(result.entries[0].id);
    }
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};
document.getElementById('open-chatgpt').onclick = () => window.yuexin.openChatGPT();

const history = document.getElementById('chat-history');
function addMessage(text, className) {
  const div = document.createElement('div'); div.className = `message ${className}`; div.textContent = text; history.append(div); history.scrollTop = history.scrollHeight; return div;
}
let streaming = null;
window.yuexin.onChatDelta((text) => { if (streaming) { streaming.textContent = text; history.scrollTop = history.scrollHeight; } });
document.getElementById('chat-form').onsubmit = async (event) => {
  event.preventDefault();
  const input = document.getElementById('chat-input'); const send = document.getElementById('chat-send');
  const text = input.value.trim(); if (!text || send.disabled) return;
  addMessage(text, 'user-message'); input.value = ''; send.disabled = true;
  streaming = addMessage(petName() + '正在想…', 'cat-message');
  try { streaming.textContent = await window.yuexin.sendChat(text); }
  catch (error) { streaming.textContent = `喵，连接失败了：${error.message}`; }
  finally { streaming = null; send.disabled = false; input.focus(); history.scrollTop = history.scrollHeight; }
};
