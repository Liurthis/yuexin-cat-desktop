const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chooseRandomAction, imageExtension } = require('../src/action-library');

test('imported pictures take part in random playback, excluding disabled and last-played entries', () => {
  const custom = [{ id: 'gif-a' }, { id: 'gif-b' }, { id: 'disabled', random: false }];
  const builtins = [{ id: 'builtin' }];
  assert.equal(chooseRandomAction(custom, builtins, 'gif-a', () => 0).id, 'gif-b');
  assert.equal(chooseRandomAction(custom, builtins, 'gif-b', () => .99).id, 'gif-a');
  assert.equal(chooseRandomAction([{ id: 'single' }], builtins, 'single', () => 0).id, 'single');
  assert.equal(chooseRandomAction([{ id: 'off', random: false }], builtins, null, () => 0).id, 'builtin');
});

test('GIF and animated image formats are kept as image assets', () => {
  assert.equal(imageExtension(Buffer.from('GIF89a\x01\x00\x01\x00')), 'gif');
  assert.equal(imageExtension(Buffer.from('RIFF\x00\x00\x00\x00WEBP')), 'webp');
  assert.equal(imageExtension(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'png');
  assert.throws(() => imageExtension(Buffer.from('<svg>')), /不是有效/);
});

test('idle timer plays a newly imported GIF and restores the rounded image after playback', async () => {
  const elements = new Map();
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const node = { className: id === 'pet' ? 'pet' : '', hidden: ['quick-feed-menu', 'companion-menu', 'focus-menu'].includes(id), dataset: {}, replaceChildren() {}, style: {}, textContent: '', attributes: {}, addEventListener() {}, setAttribute(name, value) { this.attributes[name] = String(value); }, contains(target) { return this === target; }, removeAttribute(name) { delete this[name]; } };
    function classes() { return new Set(node.className.split(' ').filter(Boolean)); }
    node.classList = {
      add(...names) { const values = classes(); names.forEach((name) => values.add(name)); node.className = [...values].join(' '); },
      remove(...names) { const values = classes(); names.forEach((name) => values.delete(name)); node.className = [...values].join(' '); },
      toggle(name, enabled) { this[enabled ? 'add' : 'remove'](name); },
    };
    elements.set(id, node); return node;
  }
  const handlers = {};
  const documentEvents = {};
  let mealsFinished = 0;
  const timers = new Map();
  let timerId = 0;
  const initial = { idleAnimations: true, randomInterval: 30, petScale: 1, showActionText: true, customActions: [], limits: { buckets: [], status: '测试' } };
  const math = Object.create(Math); math.random = () => 0;
  const context = vm.createContext({
    document: { getElementById: element, createElement: () => ({}), addEventListener: (name, callback) => { documentEvents[name] = callback; } },
    window: { addEventListener() {}, yuexin: {
      onState: (callback) => { handlers.state = callback; },
      onAction: (callback) => { handlers.action = callback; },
      onReminder: (callback) => { handlers.reminder = callback; },
      onFeed: (callback) => { handlers.feed = callback; },
      onFeedingMenu: (callback) => { handlers.menu = callback; },
      onCompanionMenu() {}, onInteraction() {},
      onGreeting() {}, onFocusMenu() {}, onFocusState() {}, onFocusFinished() {},
      finishFeeding: () => { mealsFinished += 1; },
      onHover() {}, setPetDragging() {},
      getState: async () => initial,
    } },
    Math: math, Date,
    YuexinActions: require('../src/actions'), YuexinLibrary: require('../src/action-library'), YuexinPetting: require('../src/petting-gesture'), YuexinContext: require('../src/action-context'),
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/pet.js'), 'utf8'), context);
  await Promise.resolve();
  handlers.state({ ...initial, customActions: [{ id: 'new-gif', name: '新动作', extension: 'gif', duration: 4000 }] });
  const idle = [...timers.values()].find((timer) => timer.delay === 21000);
  assert.ok(idle, 'the imported action should schedule automatic playback');
  idle.callback();
  const image = element('custom-animation');
  assert.match(image.src, /^yuexin-asset:\/\/actions\/new-gif\.gif/);
  image.onload();
  assert.match(element('pet').className, /custom/);
  const end = [...timers.values()].find((timer) => timer.delay === 4000);
  assert.ok(end);
  end.callback();
  assert.equal(image.hidden, true);
  assert.equal(element('pet').className, 'pet');
  assert.equal(image.src, undefined);
  assert.ok([...timers.values()].some((timer) => timer.delay === 21000), 'next random action is scheduled after completion');
  handlers.action('hop');
  assert.equal(element('bubble').className.includes('show'), false, 'old settings cannot enable action text');
  handlers.feed({ url: 'yuexin-asset://feeding/preset.gif', duration: 3500, preset: true });
  assert.match(image.src, /^yuexin-asset:\/\/feeding\/preset\.gif/);
  image.onload();
  handlers.action('hop');
  assert.match(element('pet').className, /custom/, 'clicking another action does not interrupt eating');
  assert.equal(element('bubble').className.includes('show'), false, 'feeding does not restore action text');
  const mealEnd = [...timers.values()].find((timer) => timer.delay === 3500);
  mealEnd.callback();
  assert.equal(mealsFinished, 1);
  assert.equal(image.hidden, true);
  handlers.feed({ url: 'yuexin-asset://feeding/custom.gif', duration: 3500, preset: false });
  image.onerror();
  assert.match(image.src, /^yuexin-asset:\/\/feeding\/preset\.gif/, 'broken eating images fall back to the preset');
  handlers.reminder('喝水');
  assert.equal(mealsFinished, 2, 'reminders can finish an eating animation');
  assert.match(element('bubble').className, /show/, 'reminder text still appears');
  handlers.state({ ...initial, feeding: { satiety: 50, isEating: false } });
  assert.match(element('feeding').style.backgroundImage, /#579464 180deg/, '50 satiety fills half the green circle');
  element('feeding').onclick();
  assert.equal(element('quick-feed-menu').hidden, false);
  assert.equal(element('feeding').attributes['aria-expanded'], 'true');
  documentEvents.keydown({ key: 'Escape' });
  assert.equal(element('quick-feed-menu').hidden, true);
  handlers.state({ ...initial, feeding: { satiety: 29, isEating: false } });
  assert.match(element('feeding').style.backgroundImage, /#db5349/);
  handlers.state({ ...initial, feeding: { satiety: 30, isEating: false } });
  assert.match(element('feeding').style.backgroundImage, /#579464/);
  handlers.state({ ...initial, feeding: { satiety: 100, isEating: false } });
  assert.equal(element('quick-feed-fish').disabled, true);
  assert.match(element('feeding').style.backgroundImage, /360deg/);
});
