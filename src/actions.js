const YuexinActions = Object.freeze([
  { id: 'hop', name: '开心跳跃', emoji: '✨', description: '原图轻轻跳一下', duration: 2400, message: '喵！今天也要开心呀～' },
  { id: 'wiggle', name: '左右摇摆', emoji: '💕', description: '原图轻轻左右摆动', duration: 2600, message: '蹭蹭你～' },
  { id: 'phone', name: '摸鱼刷手机', emoji: '📱', description: '切换到摸鱼图片', duration: 5000, message: '让我摸鱼一小会儿～' },
]);
if (typeof module !== 'undefined') module.exports = YuexinActions;
else globalThis.YuexinActions = YuexinActions;
