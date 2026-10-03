const tabs = [...document.querySelectorAll('.tabs button')];
const pages = [...document.querySelectorAll('.page')];
const list = document.getElementById('reminder-list');
const limitList = document.getElementById('limit-list');
const limitStatus = document.getElementById('limit-status');
let currentState;
let feedPending = false;
let feedingImageSignature;

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
}
window.yuexin.onState(render);
window.yuexin.getState().then(render);

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
  [...foodList.children].forEach((button) => { button.disabled = feedPending || feeding.isEating || value >= 100; });
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

async function feed(foodId) {
  const status = document.getElementById('feeding-status');
  if (feedPending) return;
  feedPending = true; renderFeeding(currentState.feeding);
  try {
    const result = await window.yuexin.feed(foodId);
    status.textContent = '喂了' + result.food.name + '，饱腹度 +' + result.gained + '，现在是 ' + result.satiety + '/100。';
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
  const builtins = document.getElementById('action-list');
  if (!builtins.children.length) YuexinActions.forEach((entry) => {
    const button = document.createElement('button'); button.className = 'action-card';
    const emoji = document.createElement('span'); emoji.className = 'action-emoji'; emoji.textContent = entry.emoji;
    const title = document.createElement('strong'); title.textContent = entry.name;
    const detail = document.createElement('small'); detail.textContent = entry.description;
    button.append(emoji, title, detail); button.onclick = () => window.yuexin.playAction(entry.id);
    builtins.append(button);
  });
  const customList = document.getElementById('custom-action-list'); customList.replaceChildren();
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
  streaming = addMessage('月薪喵正在想…', 'cat-message');
  try { streaming.textContent = await window.yuexin.sendChat(text); }
  catch (error) { streaming.textContent = `喵，连接失败了：${error.message}`; }
  finally { streaming = null; send.disabled = false; input.focus(); history.scrollTop = history.scrollHeight; }
};
