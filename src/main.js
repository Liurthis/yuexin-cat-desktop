const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, screen, shell, dialog, protocol, net, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { nextDailyTime, advanceDaily } = require('./core');
const { CodexClient } = require('./codex-client');
const actions = require('./actions');
const { normalizeScale, petBounds, validCustomAction, normalizePetPosition } = require('./pet-settings');
const { imageExtension, normalizeDuration } = require('./action-library');
const { resolveCodexPath } = require('./codex-path');
const { seedBundledActions } = require('./bundled-actions');
const { FOODS, normalizeFeeding, advanceSatiety, feedPet } = require('./feeding');
const { normalizeCompanion, advanceCompanion, companionView, interactCompanion, setSleeping, rewardFocus } = require('./companion');
const { normalizeFocus, startFocus, tickFocus, toggleFocus, focusView } = require('./focus');
const { normalizeJournal, recordJournal, journalView, journalText } = require('./journal');
const { normalizeTags } = require('./action-context');
const { normalizePetName } = require('./pet-profile');
const { normalizeRoaming, createWalkPlan, createReturnPlan, sampleWalk } = require('./roaming');
const { performance } = require('node:perf_hooks');

protocol.registerSchemesAsPrivileged([{ scheme: 'yuexin-asset', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

let petWindow;
let panelWindow;
let tray;
let state;
let stateFile;
let limits = { buckets: [], status: '正在读取…', updatedAt: null };
const codex = new CodexClient({ getCliPath: () => state?.codexPath });
let ignoringMouse = true;
let petDragging = false;
let feedingBusy = false;
let feedingEndTimer;
let playSession = null;
let lastFocusSave = 0;
let walkSession = null;
let walkDirection = 1;
let nextWalkAt = 0;
let petBusy = false;
let petMenuBusy = false;
let lastPetInput = 0;
let placingPet = false;
let automaticPosition = null;
let pendingReturn = false;
let returnReadyAt = 0;
const startupName = '月薪喵桌宠';

function loginOptions() {
  const portable = path.join(app.getAppPath(), 'dist', '月薪喵-win32-x64', '月薪喵.exe');
  const executable = app.isPackaged ? process.execPath : fs.existsSync(portable) ? portable : process.execPath;
  const args = !app.isPackaged && executable === process.execPath ? [`"${app.getAppPath()}"`, '--autostart'] : ['--autostart'];
  return { path: executable, args };
}

function getAutoStart() {
  if (process.platform !== 'win32') return false;
  try { return app.getLoginItemSettings(loginOptions()).executableWillLaunchAtLogin; }
  catch { return false; }
}

function setAutoStart(enabled) {
  if (process.platform !== 'win32') throw new Error('开机自启动设置目前支持 Windows');
  app.setLoginItemSettings({ ...loginOptions(), name: startupName, openAtLogin: Boolean(enabled), enabled: Boolean(enabled) });
  const applied = getAutoStart();
  if (applied !== Boolean(enabled)) throw new Error('自启动设置未生效，请检查 Windows 的启动应用设置');
  broadcastState();
  return applied;
}

function loadState() {
  stateFile = path.join(app.getPath('userData'), 'state.json');
  try {
    const loaded = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      reminders: Array.isArray(loaded.reminders) ? loaded.reminders : [],
      petPosition: loaded.petPosition || null,
      petName: normalizePetName(loaded.petName), quietMode: loaded.quietMode === true,
      roaming: normalizeRoaming(loaded.roaming),
      alwaysOnTop: loaded.alwaysOnTop !== false,
      petScale: normalizeScale(loaded.petScale ?? 1),
      idleAnimations: loaded.idleAnimations !== false,
      randomInterval: Math.max(10, Math.min(180, Number(loaded.randomInterval) || 30)),
      bundledActionsVersion: Number(loaded.bundledActionsVersion) || 0,
      codexPath: typeof loaded.codexPath === 'string' ? loaded.codexPath : null,
      customActions: Array.isArray(loaded.customActions) ? loaded.customActions.filter(validCustomAction).map((entry) => ({ ...entry, random: entry.random !== false, tags: normalizeTags(entry) })) : [],
      feeding: normalizeFeeding({ ...loaded.feeding, image: validCustomAction(loaded.feeding?.image) ? loaded.feeding.image : null }),
      companion: normalizeCompanion(loaded.companion),
      focus: normalizeFocus(loaded.focus), journal: normalizeJournal(loaded.journal),
    };
  } catch {
    return { reminders: [], petPosition: null, petName: normalizePetName(), quietMode: false, roaming: normalizeRoaming(), alwaysOnTop: true, petScale: 1, idleAnimations: true, randomInterval: 30, bundledActionsVersion: 0, codexPath: null, customActions: [], feeding: normalizeFeeding(), companion: normalizeCompanion(), focus: normalizeFocus(), journal: normalizeJournal() };
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const temp = `${stateFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temp, stateFile);
}

function publicState() {
  return { reminders: state.reminders, petName: state.petName, quietMode: state.quietMode, roaming: roamingView(), alwaysOnTop: state.alwaysOnTop, autoStart: getAutoStart(), petScale: state.petScale, idleAnimations: state.idleAnimations, randomInterval: state.randomInterval, customActions: state.customActions, feeding: { satiety: state.feeding.satiety, isEating: feedingBusy, foods: FOODS, image: feedingImage(), duration: state.feeding.duration }, companion: companionView(state.companion), focus: focusView(state.focus), journal: journalView(state.journal), limits };
}

function roamingView() {
  const position = petWindow && !petWindow.isDestroyed() ? petWindow.getPosition() : null;
  const home = state.petPosition;
  const awayFromHome = Boolean(position && home && Math.hypot(position[0] - home.x, position[1] - home.y) > 2);
  return { ...state.roaming, isWalking: Boolean(walkSession), direction: walkDirection, awayFromHome };
}
function delayNextWalk() {
  lastPetInput = performance.now();
  nextWalkAt = lastPetInput + state.roaming.intervalSeconds * 1000;
}
function moveAutomatically(x, y) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const position = normalizePetPosition(x, y);
  if (!position) return;
  placingPet = true;
  try { petWindow.setPosition(...position); automaticPosition = petWindow.getPosition(); }
  finally { placingPet = false; }
}
function restoreHome() {
  if (!state || !petWindow || petWindow.isDestroyed()) return;
  pendingReturn = false;
  returnReadyAt = 0;
  const bounds = petWindow.getBounds();
  const home = state.petPosition || bounds;
  const area = screen.getDisplayMatching({ ...bounds, x: home.x, y: home.y }).workArea;
  const position = normalizePetPosition(
    Math.max(area.x, Math.min(home.x, area.x + Math.max(0, area.width - bounds.width))),
    Math.max(area.y, Math.min(home.y, area.y + Math.max(0, area.height - bounds.height))),
  );
  if (!position) return;
  moveAutomatically(...position);
  if (!state.petPosition || state.petPosition.x !== position[0] || state.petPosition.y !== position[1]) {
    state.petPosition = { x: position[0], y: position[1] }; saveState();
  }
}
function emitWalk(active) {
  petWindow?.webContents.send('pet:walk', { active, direction: walkDirection });
}
function stopWalking(returnHome = false) {
  if (!state) return;
  const wasWalking = Boolean(walkSession);
  if (!wasWalking && !returnHome) return;
  pendingReturn = wasWalking && !returnHome;
  returnReadyAt = pendingReturn ? performance.now() + 5000 : 0;
  walkSession = null; delayNextWalk();
  if (returnHome) restoreHome();
  if (wasWalking) { emitWalk(false); broadcastState(); }
}
function callHome() {
  stopWalking(); delayNextWalk(); restoreHome(); petWindow?.show(); broadcastState();
  return roamingView();
}
function canWalk() {
  return petWindow && !petWindow.isDestroyed() && petWindow.isVisible() && !petDragging && !feedingBusy && !playSession && !state.companion.sleeping && !state.quietMode && !(state.focus.session?.phase === 'focus' && state.focus.session.status === 'running');
}
function startWalking(automatic = false) {
  if (walkSession) return roamingView();
  if (!canWalk()) {
    if (!automatic) throw new Error('等吃完、睡醒或结束专注，再出去走走吧～');
    return roamingView();
  }
  const bounds = petWindow.getBounds();
  const plan = createWalkPlan(bounds, screen.getDisplayMatching(bounds).workArea, state.roaming, performance.now());
  if (!plan) {
    delayNextWalk();
    if (!automatic) throw new Error('这里的空间有点小，先把我拖到宽敞一点的地方吧～');
    return roamingView();
  }
  walkSession = plan;
  walkDirection = plan.target.x < plan.origin.x ? -1 : 1;
  emitWalk(true); broadcastState();
  return roamingView();
}
function tickWalking() {
  if (!walkSession) return;
  if (!canWalk() || petBusy) { stopWalking(); return; }
  try {
    const step = sampleWalk(walkSession, performance.now());
    if (!step) { stopWalking(true); return; }
    moveAutomatically(step.x, step.y);
    if (step.direction !== walkDirection) { walkDirection = step.direction; emitWalk(true); }
    if (step.done) stopWalking(true);
  } catch (error) { stopWalking(); console.warn('月薪喵暂停散步：', error.message); }
}
function checkAutoWalk() {
  if (pendingReturn && !walkSession && canWalk() && !petBusy && !panelWindow?.isVisible() && performance.now() >= returnReadyAt && performance.now() - lastPetInput >= 5000) {
    const bounds = petWindow.getBounds();
    const cursor = screen.getCursorScreenPoint();
    if (cursor.x >= bounds.x - 24 && cursor.x <= bounds.x + bounds.width + 24 && cursor.y >= bounds.y - 24 && cursor.y <= bounds.y + bounds.height + 24) return;
    const plan = createReturnPlan(bounds, state.petPosition, screen.getDisplayMatching(bounds).workArea, state.roaming, performance.now());
    pendingReturn = false;
    if (plan) { walkSession = plan; walkDirection = plan.target.x < plan.origin.x ? -1 : 1; emitWalk(true); broadcastState(); }
    else { restoreHome(); broadcastState(); }
    return;
  }
  if (!state.roaming.enabled || walkSession || performance.now() < nextWalkAt || performance.now() - lastPetInput < 20000 || petBusy || !canWalk() || panelWindow?.isVisible() || roamingView().awayFromHome) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  if (cursor.x >= bounds.x - 24 && cursor.x <= bounds.x + bounds.width + 24 && cursor.y >= bounds.y - 24 && cursor.y <= bounds.y + bounds.height + 24) return;
  startWalking(true);
}
function setQuietMode(enabled) {
  state.quietMode = Boolean(enabled);
  if (state.quietMode) stopWalking(true);
  delayNextWalk(); saveState(); updateTray(); broadcastState();
  return state.quietMode;
}

function feedingImage() {
  const entry = state.feeding.image;
  const available = entry && fs.existsSync(path.join(app.getPath('userData'), 'feeding-assets', `${entry.id}.${entry.extension}`));
  return available ? { name: entry.name, url: `yuexin-asset://feeding/${entry.id}.${entry.extension}`, preset: false } : { name: '吃冰淇淋（预设）', url: 'yuexin-asset://feeding/preset.gif', preset: true };
}

function finishFeeding() {
  clearTimeout(feedingEndTimer);
  if (!feedingBusy) return;
  feedingBusy = false;
  broadcastState();
}

function refreshSatiety() {
  const feedingChanged = advanceSatiety(state.feeding);
  const companionChanged = advanceCompanion(state.companion, state.feeding.satiety);
  if (feedingChanged || companionChanged) { saveState(); broadcastState(); }
}

function notifyInteraction(result) {
  recordJournal(state.journal, result.type, result, state.companion);
  saveState(); broadcastState();
  petWindow?.webContents.send('pet:interaction', result);
  return result;
}

function refreshFocus() {
  const now = Date.now();
  const result = tickFocus(state.focus, now);
  if (!result.changed) return;
  if (result.event) {
    const event = result.event;
    if (event.kind === 'focus') {
      stopWalking();
      event.reward = rewardFocus(state.companion, state.feeding.satiety, now);
      recordJournal(state.journal, 'focus', event, state.companion, now);
    }
    saveState(); lastFocusSave = now; broadcastState();
    petWindow?.webContents.send('focus:finished', event);
    const notification = new Notification({ title: state.petName + '陪你专注', body: event.kind === 'focus' ? `完成 ${event.minutes} 分钟专注，休息 ${event.breakMinutes} 分钟吧～` : '休息结束啦，准备好了再开始下一段吧～', silent: state.quietMode, icon: path.join(__dirname, '..', 'assets', 'yuexin-idle.png') });
    notification.on('click', showQuickFocus); notification.show();
  } else {
    if (now - lastFocusSave >= 15000) { saveState(); lastFocusSave = now; }
    for (const win of [petWindow, panelWindow]) if (win && !win.isDestroyed()) win.webContents.send('focus:changed', focusView(state.focus, now));
  }
}
function pauseFocusForSystem() {
  if (!state || state.focus.session?.status !== 'running') return;
  refreshFocus();
  if (state.focus.session?.status === 'running') { toggleFocus(state.focus); saveState(); broadcastState(); }
}
function showQuickFocus() {
  stopWalking();
  petWindow?.show(); petWindow?.webContents.send('focus:openMenu');
}

function showCompanion() {
  stopWalking();
  petWindow?.show();
  petWindow?.webContents.send('companion:openMenu');
}

function storeFeedingImage(source, name) {
  if (fs.statSync(source).size > 20 * 1024 * 1024) throw new Error('吃饭图片需小于 20 MB');
  const bytes = fs.readFileSync(source);
  const entry = { id: crypto.randomUUID(), extension: imageExtension(bytes), name: name.slice(0, 40) || '吃饭动作', duration: state.feeding.duration };
  const folder = path.join(app.getPath('userData'), 'feeding-assets');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${entry.id}.${entry.extension}`), bytes);
  const previous = state.feeding.image;
  state.feeding.image = entry;
  saveState(); broadcastState();
  if (previous) { try { fs.unlinkSync(path.join(folder, `${previous.id}.${previous.extension}`)); } catch {} }
}

function setPetInteractive(interactive) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const ignore = !interactive && !petDragging;
  if (ignore === ignoringMouse) return;
  ignoringMouse = ignore;
  petWindow.webContents.send('pet:hover', !ignore);
  petWindow.setIgnoreMouseEvents(ignore, { forward: true });
}

function broadcastState() {
  for (const win of [petWindow, panelWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('state:changed', publicState());
  }
}

async function refreshLimits() {
  limits = { ...limits, status: '正在读取…' };
  broadcastState();
  try {
    const buckets = await codex.readLimits();
    limits = {
      buckets,
      status: buckets.length ? '已更新' : '当前账户没有可用的额度信息',
      updatedAt: Date.now(),
    };
  } catch (error) {
    limits = { buckets: [], status: `读取失败：${error.message}`, updatedAt: null };
  }
  broadcastState();
  return limits;
}

function showPanel(tab = 'reminders') {
  stopWalking();
  if (!panelWindow || panelWindow.isDestroyed()) {
    panelWindow = new BrowserWindow({
      width: 430, height: 620, minWidth: 380, minHeight: 520,
      title: state.petName + '的小窝', backgroundColor: '#fffaf5',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    panelWindow.loadFile(path.join(__dirname, 'panel.html'));
    panelWindow.webContents.once('did-finish-load', () => {
      panelWindow.webContents.send('state:changed', publicState());
      panelWindow.webContents.send('panel:tab', tab);
    });
    panelWindow.on('hide', () => { if (pendingReturn) returnReadyAt = performance.now() + 5000; });
    panelWindow.on('closed', () => { panelWindow = null; if (pendingReturn) returnReadyAt = performance.now() + 5000; });
  } else {
    panelWindow.show();
    panelWindow.focus();
    panelWindow.webContents.send('panel:tab', tab);
  }
}

function showQuickFeeding() {
  stopWalking();
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.show();
  petWindow.webContents.send('feeding:openMenu');
}

function createPet() {
  const display = screen.getPrimaryDisplay().workArea;
  let bounds = petBounds(state.petScale, null, display);
  if (state.petPosition && Number.isFinite(state.petPosition.x) && Number.isFinite(state.petPosition.y)) {
    const previous = { ...bounds, ...state.petPosition };
    bounds = petBounds(state.petScale, previous, screen.getDisplayMatching(previous).workArea);
  }
  petWindow = new BrowserWindow({
    ...bounds,
    frame: false, transparent: true, resizable: false, hasShadow: false,
    skipTaskbar: true, alwaysOnTop: state.alwaysOnTop,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  petWindow.setMenu(null);
  const initialPosition = petWindow.getPosition();
  state.petPosition = { x: initialPosition[0], y: initialPosition[1] }; saveState();
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  let samplingPixel = false;
  const pointerTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const point = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    const inside = point.x >= 0 && point.y >= 0 && point.x < bounds.width && point.y < bounds.height;
    if (!inside) { setPetInteractive(false); return; }
    if (petDragging || samplingPixel || petWindow.webContents.isLoading()) return;
    samplingPixel = true;
    const win = petWindow;
    // Sample the rendered page: this also follows every frame of imported GIFs.
    win.webContents.capturePage({ x: Math.floor(point.x), y: Math.floor(point.y), width: 1, height: 1 }).then((image) => {
      if (petWindow !== win || win.isDestroyed() || petDragging) return;
      const latest = screen.getCursorScreenPoint();
      const currentBounds = win.getBounds();
      if (Math.abs(latest.x - cursor.x) > 2 || Math.abs(latest.y - cursor.y) > 2 || currentBounds.x !== bounds.x || currentBounds.y !== bounds.y || currentBounds.width !== bounds.width || currentBounds.height !== bounds.height) return;
      const pixels = image.toBitmap();
      let opaque = false;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 18) { opaque = true; break; }
      setPetInteractive(opaque);
    }).catch(() => setPetInteractive(false)).finally(() => { samplingPixel = false; });
  }, 50);
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  petWindow.webContents.once('did-finish-load', () => { broadcastState(); petWindow.webContents.send('pet:greeting'); });
  petWindow.webContents.on('context-menu', () => {
    stopWalking();
    Menu.buildFromTemplate([
      { label: '打开小窝', click: () => showPanel() },
      { label: '添加提醒', click: () => showPanel('reminders') },
      { label: '喂月薪喵吃东西', click: showQuickFeeding },
      { label: '摸摸 / 逗猫 / 睡觉', click: showCompanion },
      { label: '叫它回小窝', click: callHome },
      { label: '安静陪伴', type: 'checkbox', checked: state.quietMode, click: (item) => setQuietMode(item.checked) },
      { label: '一起专注', click: showQuickFocus },
      { label: '陪伴日记', click: () => showPanel('journal') },
      { label: '选择 / 添加动作', click: () => showPanel('actions') },
      { label: '调整大小', click: () => showPanel('settings') },
      { label: '查看 GPT 额度', click: () => showPanel('usage') },
      { type: 'separator' },
      { label: '退出月薪喵', click: () => app.quit() },
    ]).popup({ window: petWindow });
  });
  let positionSaveTimer;
  petWindow.on('move', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    if (placingPet || walkSession || (automaticPosition && automaticPosition[0] === x && automaticPosition[1] === y)) return;
    automaticPosition = null;
    state.petPosition = { x, y };
    clearTimeout(positionSaveTimer);
    positionSaveTimer = setTimeout(() => { positionSaveTimer = null; saveState(); }, 250);
  });
  petWindow.on('closed', () => {
    walkSession = null;
    clearInterval(pointerTimer);
    if (positionSaveTimer) { clearTimeout(positionSaveTimer); saveState(); }
    petWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'yuexin-idle.png')).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  updateTray();
  tray.on('double-click', () => showPanel());
}
function updateTray() {
  if (!tray) return;
  tray.setToolTip(state.petName + '桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开小窝', click: () => showPanel() },
    { label: '显示月薪喵', click: () => petWindow?.show() },
    { label: '叫它回小窝', click: callHome },
    { label: '安静陪伴', type: 'checkbox', checked: state.quietMode, click: (item) => setQuietMode(item.checked) },
    { label: '喂月薪喵', click: showQuickFeeding },
    { label: '陪月薪喵玩', click: showCompanion },
    { label: '一起专注', click: showQuickFocus },
    { label: '陪伴日记', click: () => showPanel('journal') },
    { label: '查看 GPT 额度', click: () => showPanel('usage') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

function fireReminder(reminder) {
  stopWalking();
  playSession = null;
  const notification = new Notification({
    title: state.petName + '提醒你', body: reminder.title, silent: state.quietMode,
    icon: path.join(__dirname, '..', 'assets', 'yuexin-idle.png'),
  });
  notification.on('click', () => showPanel('reminders'));
  notification.show();
  petWindow?.show();
  petWindow?.webContents.send('reminder:fired', reminder.title);
}

function checkReminders() {
  const now = Date.now();
  const due = state.reminders.filter((item) => item.enabled && Number(item.nextAt) <= now);
  if (!due.length) return;
  for (const item of due) {
    if (item.repeat === 'daily') item.nextAt = advanceDaily(item.nextAt, now);
    else item.enabled = false;
  }
  saveState();
  broadcastState();
  due.forEach(fireReminder);
}

function registerIpc() {
  ipcMain.handle('state:get', () => { refreshSatiety(); refreshFocus(); return publicState(); });
  const fromPet = (event) => { if (event.sender !== petWindow?.webContents) throw new Error('请从桌宠发起互动'); };
  const fromApp = (event) => { if (event.sender !== petWindow?.webContents && event.sender !== panelWindow?.webContents) throw new Error('请从月薪喵的界面操作'); };
  ipcMain.handle('settings:petName', (event, name) => {
    fromApp(event); state.petName = normalizePetName(name);
    panelWindow?.setTitle(state.petName + '的小窝');
    saveState(); updateTray(); broadcastState(); return state.petName;
  });
  ipcMain.handle('settings:quietMode', (event, enabled) => { fromApp(event); return setQuietMode(enabled); });
  ipcMain.handle('settings:roaming', (event, input) => {
    fromApp(event); state.roaming = normalizeRoaming({ ...state.roaming, ...input });
    if (!state.roaming.enabled) stopWalking(true);
    delayNextWalk(); saveState(); broadcastState(); return roamingView();
  });
  ipcMain.handle('roaming:toggle', (event) => {
    fromPet(event);
    if (walkSession || roamingView().awayFromHome) return callHome();
    return startWalking();
  });
  ipcMain.handle('roaming:home', (event) => { fromApp(event); return callHome(); });
  ipcMain.on('pet:busy', (event, input) => {
    if (event.sender !== petWindow?.webContents) return;
    const menu = input?.menu === true;
    if (menu && !petMenuBusy) delayNextWalk();
    const wasBusy = petBusy;
    petMenuBusy = menu; petBusy = input?.busy === true;
    if (petBusy) stopWalking();
    else if (wasBusy && pendingReturn) returnReadyAt = performance.now() + 5000;
  });
  ipcMain.handle('focus:start', (event, input) => {
    fromApp(event); refreshFocus();
    startFocus(state.focus, input, Date.now(), crypto.randomUUID());
    stopWalking(); delayNextWalk();
    playSession = null; saveState(); lastFocusSave = Date.now(); broadcastState();
    return focusView(state.focus);
  });
  ipcMain.handle('focus:toggle', (event) => {
    fromApp(event); refreshFocus(); toggleFocus(state.focus); stopWalking(); delayNextWalk(); saveState(); broadcastState(); return focusView(state.focus);
  });
  ipcMain.handle('focus:end', (event) => {
    fromApp(event); refreshFocus(); state.focus.session = null; saveState(); broadcastState(); return focusView(state.focus);
  });
  ipcMain.handle('focus:settings', (event, input) => {
    fromApp(event); state.focus.settings = normalizeFocus({ settings: input }).settings; saveState(); broadcastState();
  });
  ipcMain.handle('journal:export', async (event) => {
    if (event.sender !== panelWindow?.webContents) throw new Error('请从日记页导出');
    const result = await dialog.showSaveDialog(panelWindow, { title: '保存月薪喵的陪伴日记', defaultPath: '月薪喵的陪伴日记.txt', filters: [{ name: '文本日记', extensions: ['txt'] }] });
    if (result.canceled) return false;
    fs.writeFileSync(result.filePath, '\ufeff' + journalText(state.journal, state.petName), 'utf8'); return true;
  });
  ipcMain.handle('companion:pet', (event) => {
    fromPet(event);
    if (playSession && Date.now() > playSession.expiresAt) playSession = null;
    if (feedingBusy || playSession) throw new Error('等吃完或玩完，再来摸摸吧～');
    stopWalking(); delayNextWalk();
    refreshSatiety();
    return notifyInteraction(interactCompanion(state.companion, 'petting', state.feeding.satiety));
  });
  ipcMain.handle('companion:sleep', (event, sleeping) => {
    fromPet(event);
    if (feedingBusy) throw new Error('先吃完再休息吧～');
    stopWalking(); delayNextWalk();
    refreshSatiety();
    playSession = null;
    setSleeping(state.companion, sleeping, state.feeding.satiety);
    saveState(); broadcastState();
  });
  ipcMain.handle('companion:animation', (event, kind, actionId) => {
    if (event.sender !== panelWindow?.webContents) throw new Error('请在设置里更换互动 GIF');
    if (!['petting', 'play', 'sleep'].includes(kind)) throw new Error('请选择互动类型');
    if (!['auto', 'original'].includes(actionId) && !state.customActions.some((entry) => entry.id === actionId)) throw new Error('这个动作不存在，请重新选择');
    state.companion.animations[kind] = actionId;
    saveState(); broadcastState();
  });
  ipcMain.handle('companion:playStart', (event) => {
    fromPet(event); refreshSatiety();
    if (feedingBusy || state.companion.sleeping) throw new Error('等吃完、睡醒后再一起玩吧～');
    const now = Date.now();
    if (companionView(state.companion).cooldownUntil.play > now) throw new Error('刚玩过啦，休息一会儿再玩～');
    if (playSession && now < playSession.expiresAt) throw new Error('小球已经准备好啦');
    stopWalking(); delayNextWalk();
    playSession = { token: crypto.randomUUID(), startedAt: now, expiresAt: now + 15000, hits: 0, lastHit: 0 };
    return { token: playSession.token, duration: 12000 };
  });
  ipcMain.handle('companion:playHit', (event, token) => {
    fromPet(event);
    const now = Date.now();
    if (!playSession || playSession.token !== token || now > playSession.expiresAt) { playSession = null; throw new Error('这局结束啦，再点逗猫试试～'); }
    if (now - playSession.lastHit < 250) return { hits: playSession.hits, finished: false };
    playSession.lastHit = now;
    playSession.hits += 1;
    if (playSession.hits < 3) return { hits: playSession.hits, finished: false };
    playSession = null;
    return { hits: 3, finished: true, result: notifyInteraction(interactCompanion(state.companion, 'play', state.feeding.satiety, now)) };
  });
  ipcMain.on('companion:playCancel', (event, token) => { if (event.sender === petWindow?.webContents && playSession?.token === token) playSession = null; });
  ipcMain.handle('feeding:feed', (event, foodId) => {
    if (event.sender !== panelWindow?.webContents && event.sender !== petWindow?.webContents) throw new Error('请从桌宠的喂食选项选择食物');
    if (feedingBusy) throw new Error('还在吃呢，等吃完再喂吧～');
    if (!petWindow || petWindow.isDestroyed()) throw new Error('桌宠还没有准备好');
    stopWalking(); delayNextWalk();
    refreshSatiety();
    const previousSatiety = state.feeding.satiety;
    const result = feedPet(state.feeding, foodId);
    result.companion = interactCompanion(state.companion, 'feed', previousSatiety, Date.now(), foodId);
    recordJournal(state.journal, 'feed', { ...result.companion, foodId }, state.companion);
    playSession = null;
    saveState();
    feedingBusy = true;
    broadcastState();
    petWindow.show();
    petWindow.webContents.send('pet:feed', { ...feedingImage(), duration: state.feeding.duration, result: result.companion });
    feedingEndTimer = setTimeout(finishFeeding, state.feeding.duration + 10000);
    return result;
  });
  ipcMain.on('feeding:finished', (event) => { if (event.sender === petWindow?.webContents) finishFeeding(); });
  ipcMain.handle('feeding:setImage', (event, actionId) => {
    if (event.sender !== panelWindow?.webContents) throw new Error('请在设置页修改吃饭图片');
    if (feedingBusy) throw new Error('等吃完后再更换图片吧～');
    if (actionId === 'preset') {
      const previous = state.feeding.image;
      state.feeding.image = null;
      saveState(); broadcastState();
      if (previous) { try { fs.unlinkSync(path.join(app.getPath('userData'), 'feeding-assets', `${previous.id}.${previous.extension}`)); } catch {} }
      return;
    }
    const entry = state.customActions.find((item) => item.id === actionId);
    if (!entry) throw new Error('这个动作不存在，请重新选择');
    storeFeedingImage(path.join(app.getPath('userData'), 'action-assets', `${entry.id}.${entry.extension}`), entry.name);
  });
  ipcMain.handle('feeding:importImage', async (event) => {
    if (event.sender !== panelWindow?.webContents) throw new Error('请在设置页修改吃饭图片');
    if (feedingBusy) throw new Error('等吃完后再更换图片吧～');
    const result = await dialog.showOpenDialog(panelWindow, { title: '选择月薪喵的吃饭图片 / GIF', properties: ['openFile'], filters: [{ name: '图片 / 动图', extensions: ['gif', 'webp', 'png', 'apng', 'jpg', 'jpeg'] }] });
    if (result.canceled) return false;
    if (feedingBusy) throw new Error('等吃完后再更换图片吧～');
    const source = result.filePaths[0];
    storeFeedingImage(source, path.basename(source, path.extname(source)));
    return true;
  });
  ipcMain.handle('feeding:duration', (event, seconds) => {
    if (event.sender !== panelWindow?.webContents) throw new Error('请在设置页修改吃饭时长');
    if (feedingBusy) throw new Error('等吃完后再调整时长吧～');
    state.feeding.duration = normalizeDuration(seconds);
    saveState(); broadcastState();
  });
  ipcMain.handle('panel:open', (_event, tab) => showPanel(tab));
  ipcMain.handle('pet:getPosition', () => petWindow?.getPosition() || [0, 0]);
  ipcMain.on('pet:dragging', (event, dragging) => {
    if (event.sender !== petWindow?.webContents) return;
    petDragging = Boolean(dragging);
    if (petDragging) { stopWalking(); delayNextWalk(); }
    if (petDragging) setPetInteractive(true);
  });
  ipcMain.on('pet:setPosition', (event, x, y) => {
    if (!petWindow || petWindow.isDestroyed() || event.sender !== petWindow.webContents) return;
    const position = normalizePetPosition(x, y);
    if (!position) return;
    pendingReturn = false;
    automaticPosition = null;
    try { petWindow.setPosition(...position); }
    catch (error) { console.warn('月薪喵拖拽位置更新失败：', error.message); }
  });
  ipcMain.handle('reminder:add', (_event, input) => {
    const title = String(input?.title || '').trim();
    if (!title || title.length > 100) throw new Error('提醒内容需要 1～100 个字');
    const repeat = input?.repeat === 'daily' ? 'daily' : 'once';
    const nextAt = repeat === 'daily' ? nextDailyTime(input.time) : Number(input?.timestamp);
    if (!Number.isFinite(nextAt) || nextAt <= Date.now()) throw new Error('请选择将来的提醒时间');
    const reminder = { id: crypto.randomUUID(), title, repeat, nextAt, enabled: true };
    state.reminders.push(reminder);
    state.reminders.sort((a, b) => a.nextAt - b.nextAt);
    saveState(); broadcastState();
    return reminder;
  });
  ipcMain.handle('reminder:toggle', (_event, id) => {
    const item = state.reminders.find((entry) => entry.id === id);
    if (!item) return;
    item.enabled = !item.enabled;
    if (item.enabled && item.repeat === 'daily' && item.nextAt <= Date.now()) item.nextAt = advanceDaily(item.nextAt);
    if (item.enabled && item.repeat === 'once' && item.nextAt <= Date.now()) item.enabled = false;
    saveState(); broadcastState();
  });
  ipcMain.handle('reminder:delete', (_event, id) => {
    state.reminders = state.reminders.filter((entry) => entry.id !== id);
    saveState(); broadcastState();
  });
  ipcMain.handle('limits:refresh', () => refreshLimits());
  ipcMain.handle('account:connect', async () => {
    const authUrl = await codex.beginLogin();
    const parsed = new URL(authUrl);
    if (parsed.protocol !== 'https:' || !['chatgpt.com', 'auth.openai.com'].includes(parsed.hostname)) {
      throw new Error('Codex 返回的登录链接无效');
    }
    await shell.openExternal(authUrl);
  });
  ipcMain.handle('account:selectCli', async () => {
    const result = await dialog.showOpenDialog(panelWindow, { title: '选择 Codex 程序', properties: ['openFile'], filters: [{ name: 'Codex 程序（codex.exe）', extensions: ['exe'] }] });
    if (result.canceled) return;
    const candidate = result.filePaths[0];
    if (path.basename(candidate).toLowerCase() !== 'codex.exe') throw new Error('请选择 codex.exe');
    state.codexPath = resolveCodexPath(candidate);
    codex.stop(); saveState();
    return refreshLimits();
  });
  ipcMain.handle('settings:top', (_event, enabled) => {
    state.alwaysOnTop = Boolean(enabled);
    petWindow?.setAlwaysOnTop(state.alwaysOnTop);
    saveState(); broadcastState();
  });
  ipcMain.handle('settings:autoStart', (event, enabled) => {
    if (event.sender !== panelWindow?.webContents) throw new Error('请在设置页修改自启动');
    return setAutoStart(enabled);
  });
  ipcMain.handle('settings:scale', (_event, value) => {
    stopWalking(true); automaticPosition = null;
    state.petScale = normalizeScale(value);
    if (petWindow && !petWindow.isDestroyed()) {
      const previous = petWindow.getBounds();
      petWindow.setBounds(petBounds(state.petScale, previous, screen.getDisplayMatching(previous).workArea));
    }
    saveState(); broadcastState();
    return state.petScale;
  });
  ipcMain.handle('settings:idle', (_event, enabled) => {
    state.idleAnimations = Boolean(enabled);
    saveState(); broadcastState();
  });
  ipcMain.handle('settings:interval', (_event, seconds) => {
    state.randomInterval = Math.max(10, Math.min(180, Number(seconds) || 30));
    saveState(); broadcastState();
  });
  ipcMain.handle('pet:action', (_event, id) => {
    if (!actions.some((action) => action.id === id) && !state.customActions.some((action) => action.id === id)) throw new Error('找不到这个动作');
    petWindow?.show();
    petWindow?.webContents.send('pet:action', id);
  });
  ipcMain.handle('action:import', async (event, duration) => {
    if (event.sender !== panelWindow?.webContents) throw new Error('请在动作页导入');
    const result = await dialog.showOpenDialog(panelWindow, {
      title: '添加月薪猫图片动作（可以多选）', properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片 / 动图', extensions: ['gif', 'webp', 'png', 'apng', 'jpg', 'jpeg'] }],
    });
    if (result.canceled || !result.filePaths.length) return;
    const folder = path.join(app.getPath('userData'), 'action-assets');
    fs.mkdirSync(folder, { recursive: true });
    const entries = [];
    const errors = [];
    for (const source of result.filePaths) {
      try {
        if (fs.statSync(source).size > 20 * 1024 * 1024) throw new Error('每张图片需小于 20 MB');
        const bytes = fs.readFileSync(source);
        const extension = imageExtension(bytes);
        const entry = { id: crypto.randomUUID(), extension, name: path.basename(source, path.extname(source)).slice(0, 40) || '新动作', duration: normalizeDuration(duration), random: true };
        entry.tags = normalizeTags(entry);
        // Preserve the original bytes, including all animation frames and timings.
        fs.writeFileSync(path.join(folder, `${entry.id}.${extension}`), bytes);
        state.customActions.push(entry);
        entries.push(entry);
      } catch (error) { errors.push(`${path.basename(source)}：${error.message}`); }
    }
    saveState(); broadcastState();
    return { entries, errors };
  });
  ipcMain.handle('action:update', (event, id, update) => {
    fromApp(event);
    const entry = state.customActions.find((item) => item.id === id);
    if (!entry) return;
    if (typeof update?.random === 'boolean') entry.random = update.random;
    if (update?.duration !== undefined) entry.duration = normalizeDuration(update.duration);
    if (Array.isArray(update?.tags)) entry.tags = normalizeTags({ ...entry, tags: update.tags });
    saveState(); broadcastState();
  });
  ipcMain.handle('action:remove', (_event, id) => {
    const entry = state.customActions.find((item) => item.id === id);
    if (!entry) return;
    state.customActions = state.customActions.filter((item) => item.id !== id);
    saveState(); broadcastState();
    try { fs.unlinkSync(path.join(app.getPath('userData'), 'action-assets', `${entry.id}.${entry.extension}`)); } catch {}
  });
  ipcMain.handle('chat:send', async (event, message) => {
    if (event.sender !== panelWindow?.webContents) throw new Error('请在月薪喵的小窝中聊天');
    const text = String(message || '').trim();
    if (!text || text.length > 500) throw new Error('请输入 1～500 个字');
    const answer = await codex.chat(text, app.getPath('userData'), (partial) => {
      if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send('chat:delta', partial);
    });
    refreshLimits();
    return answer;
  });
  ipcMain.handle('chatgpt:openUsage', () => shell.openExternal('https://chatgpt.com/'));
}

app.on('second-instance', (_event, argv) => {
  if (argv.includes('--enable-autostart')) setAutoStart(true);
  if (argv.includes('--disable-autostart')) setAutoStart(false);
  petWindow?.show();
  if (!argv.includes('--autostart') && !argv.includes('--enable-autostart') && !argv.includes('--disable-autostart')) showPanel();
});
app.on('window-all-closed', () => {});
app.whenReady().then(() => {
  app.setAppUserModelId('com.yuexin.desktop-pet');
  state = loadState();
  if (seedBundledActions(state, path.join(__dirname, '..', 'assets', 'actions'), path.join(app.getPath('userData'), 'action-assets'))) saveState();
  state.customActions = state.customActions.map((entry) => ({ ...entry, tags: normalizeTags(entry) }));
  advanceSatiety(state.feeding);
  advanceCompanion(state.companion, state.feeding.satiety);
  saveState();
  if (process.argv.includes('--enable-autostart')) setAutoStart(true);
  if (process.argv.includes('--disable-autostart')) setAutoStart(false);
  protocol.handle('yuexin-asset', async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'feeding') {
      const entry = state.feeding.image;
      const source = url.pathname === '/preset.gif' ? path.join(__dirname, '..', 'assets', 'yuexin-eating.gif') : entry && url.pathname === `/${entry.id}.${entry.extension}` ? path.join(app.getPath('userData'), 'feeding-assets', `${entry.id}.${entry.extension}`) : null;
      if (!source || !fs.existsSync(source)) return new Response('Not found', { status: 404 });
      const response = await net.fetch(pathToFileURL(source).toString());
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, { status: response.status, headers });
    }
    const entry = state.customActions.find((item) => url.hostname === 'actions' && url.pathname === `/${item.id}.${item.extension}`);
    if (!entry) return new Response('Not found', { status: 404 });
    const response = await net.fetch(pathToFileURL(path.join(app.getPath('userData'), 'action-assets', `${entry.id}.${entry.extension}`)).toString());
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, { status: response.status, headers });
  });
  codex.on('notification', (message) => {
    codex.handleNotification(message);
    if (message.method === 'account/login/completed' && message.params?.success) refreshLimits();
  });
  registerIpc();
  createPet();
  createTray();
  delayNextWalk();
  setInterval(tickWalking, 40);
  setInterval(checkAutoWalk, 1000);
  setInterval(checkReminders, 15000);
  setInterval(refreshLimits, 120000);
  setInterval(refreshSatiety, 60000);
  setInterval(refreshFocus, 1000);
  powerMonitor.on('suspend', () => { stopWalking(true); pauseFocusForSystem(); });
  powerMonitor.on('lock-screen', () => { stopWalking(true); pauseFocusForSystem(); });
  screen.on('display-removed', () => { stopWalking(true); restoreHome(); });
  screen.on('display-metrics-changed', () => { stopWalking(true); restoreHome(); });
  checkReminders();
  refreshLimits();
});
app.on('before-quit', () => { stopWalking(true); pauseFocusForSystem(); codex.stop(); });
