(function (root) {
  const TAGS = [
    { id: 'idle', name: '日常', emoji: '🐾' }, { id: 'happy', name: '开心', emoji: '😊' },
    { id: 'hungry', name: '肚子饿', emoji: '🐟' }, { id: 'sleep', name: '困困', emoji: '💤' },
    { id: 'greeting', name: '打招呼', emoji: '👋' }, { id: 'focus', name: '专注', emoji: '⌛' },
    { id: 'celebrate', name: '庆祝', emoji: '🎉' }, { id: 'walk', name: '散步', emoji: '🐾' },
  ];
  function normalizeTags(entry) {
    if (Array.isArray(entry.tags)) return [...new Set(entry.tags.filter((tag) => TAGS.some((item) => item.id === tag)))];
    const name = entry.name || '';
    if (/散步|走路|walking|walk/i.test(name)) return ['walk'];
    if (/困困|睡|sleep/i.test(name) || entry.id === '9e1049df-cbf2-4eae-a93e-180cf5766f2b') return ['sleep'];
    if (/你好|招呼|hello/i.test(name) || entry.id === 'fb722314-63b0-4c98-852c-33ce30817f1c') return ['greeting'];
    if (/爱你|喜欢|开心|love/i.test(name)) return ['happy', 'celebrate'];
    if (/吃饭|吃冰淇淋|eat|饿/i.test(name) || ['8ae79b72-ae5c-4a0d-8001-a13e0c29dbcb', '9a20d58e-7ff9-405c-ac01-6dc2d4c1a9ac'].includes(entry.id)) return ['hungry'];
    if (/专注|工作|focus/i.test(name)) return ['focus'];
    return ['idle'];
  }
  function chooseForTag(custom, tag, previousId, random = Math.random) {
    const pool = custom.filter((entry) => entry.random !== false && normalizeTags(entry).includes(tag));
    const alternatives = pool.filter((entry) => entry.id !== previousId);
    const choices = alternatives.length ? alternatives : pool;
    return choices.length ? choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] : null;
  }
  function contextTag(state, hour = new Date().getHours()) {
    if (state.companion?.sleeping) return 'sleep';
    if (state.focus?.session?.phase === 'focus' && state.focus.session.status === 'running') return 'focus';
    if ((state.feeding?.satiety ?? 70) < 30) return 'hungry';
    if ((state.companion?.mood ?? 75) >= 85) return 'happy';
    if (hour >= 23 || hour < 7) return 'sleep';
    return 'idle';
  }
  const api = { TAGS, normalizeTags, chooseForTag, contextTag };
  if (typeof module !== 'undefined') module.exports = api;
  else root.YuexinContext = api;
})(globalThis);
