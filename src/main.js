const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, screen, shell, dialog, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { nextDailyTime, advanceDaily } = require('./core');
const { CodexClient } = require('./codex-client');
const actions = require('./actions');
const { normalizeScale, petBounds, validCustomAction } = require('./pet-settings');
const { imageExtension, normalizeDuration } = require('./action-library');
const { resolveCodexPath } = require('./codex-path');
const { seedBundledActions } = require('./bundled-actions');

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
      alwaysOnTop: loaded.alwaysOnTop !== false,
      petScale: normalizeScale(loaded.petScale ?? 1),
      idleAnimations: loaded.idleAnimations !== false,
      randomInterval: Math.max(10, Math.min(180, Number(loaded.randomInterval) || 30)),
      bundledActionsVersion: Number(loaded.bundledActionsVersion) || 0,
      codexPath: typeof loaded.codexPath === 'string' ? loaded.codexPath : null,
      customActions: Array.isArray(loaded.customActions) ? loaded.customActions.filter(validCustomAction).map((entry) => ({ ...entry, random: entry.random !== false })) : [],
    };
  } catch {
    return { reminders: [], petPosition: null, alwaysOnTop: true, petScale: 1, idleAnimations: true, randomInterval: 30, bundledActionsVersion: 0, codexPath: null, customActions: [] };
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const temp = `${stateFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temp, stateFile);
}

function publicState() {
  return { reminders: state.reminders, alwaysOnTop: state.alwaysOnTop, autoStart: getAutoStart(), petScale: state.petScale, idleAnimations: state.idleAnimations, randomInterval: state.randomInterval, customActions: state.customActions, limits };
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
  if (!panelWindow || panelWindow.isDestroyed()) {
    panelWindow = new BrowserWindow({
      width: 430, height: 620, minWidth: 380, minHeight: 520,
      title: '月薪喵的小窝', backgroundColor: '#fffaf5',
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
    panelWindow.on('closed', () => { panelWindow = null; });
  } else {
    panelWindow.show();
    panelWindow.focus();
    panelWindow.webContents.send('panel:tab', tab);
  }
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
  petWindow.webContents.once('did-finish-load', () => broadcastState());
  petWindow.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: '打开小窝', click: () => showPanel() },
      { label: '添加提醒', click: () => showPanel('reminders') },
      { label: '选择 / 添加动作', click: () => showPanel('actions') },
      { label: '调整大小', click: () => showPanel('settings') },
      { label: '查看 GPT 额度', click: () => showPanel('usage') },
      { type: 'separator' },
      { label: '退出月薪喵', click: () => app.quit() },
    ]).popup({ window: petWindow });
  });
  petWindow.on('moved', () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    state.petPosition = { x, y };
    saveState();
  });
  petWindow.on('closed', () => { clearInterval(pointerTimer); petWindow = null; });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'yuexin-idle.png')).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip('月薪喵桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开小窝', click: () => showPanel() },
    { label: '显示月薪喵', click: () => petWindow?.show() },
    { label: '查看 GPT 额度', click: () => showPanel('usage') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
  tray.on('double-click', () => showPanel());
}

function fireReminder(reminder) {
  const notification = new Notification({
    title: '月薪喵提醒你', body: reminder.title,
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
  ipcMain.handle('state:get', () => publicState());
  ipcMain.handle('panel:open', (_event, tab) => showPanel(tab));
  ipcMain.handle('pet:getPosition', () => petWindow?.getPosition() || [0, 0]);
  ipcMain.on('pet:dragging', (event, dragging) => {
    if (event.sender !== petWindow?.webContents) return;
    petDragging = Boolean(dragging);
    if (petDragging) setPetInteractive(true);
  });
  ipcMain.on('pet:setPosition', (_event, x, y) => {
    if (!petWindow || !Number.isFinite(x) || !Number.isFinite(y)) return;
    petWindow.setPosition(Math.round(x), Math.round(y));
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
        // Preserve the original bytes, including all animation frames and timings.
        fs.writeFileSync(path.join(folder, `${entry.id}.${extension}`), bytes);
        state.customActions.push(entry);
        entries.push(entry);
      } catch (error) { errors.push(`${path.basename(source)}：${error.message}`); }
    }
    saveState(); broadcastState();
    return { entries, errors };
  });
  ipcMain.handle('action:update', (_event, id, update) => {
    const entry = state.customActions.find((item) => item.id === id);
    if (!entry) return;
    if (typeof update?.random === 'boolean') entry.random = update.random;
    if (update?.duration !== undefined) entry.duration = normalizeDuration(update.duration);
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
  if (process.argv.includes('--enable-autostart')) setAutoStart(true);
  if (process.argv.includes('--disable-autostart')) setAutoStart(false);
  protocol.handle('yuexin-asset', async (request) => {
    const url = new URL(request.url);
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
  setInterval(checkReminders, 15000);
  setInterval(refreshLimits, 120000);
  checkReminders();
  refreshLimits();
});
app.on('before-quit', () => codex.stop());
