// Recognize gentle back-and-forth strokes without changing click or drag gestures.
function createPettingGesture() {
  let stroke = null;
  return {
    reset() { stroke = null; },
    move(x, y, pressed, now = Date.now()) {
      if (pressed || x < .23 || x > .77 || y < .07 || y > .49) { stroke = null; return false; }
      if (!stroke || now - stroke.startedAt > 2800) { stroke = { x, anchor: x, direction: 0, turns: 0, distance: 0, startedAt: now }; return false; }
      stroke.distance += Math.abs(x - stroke.x);
      stroke.x = x;
      const delta = x - stroke.anchor;
      if (Math.abs(delta) >= .055) {
        const direction = Math.sign(delta);
        if (stroke.direction && direction !== stroke.direction) stroke.turns += 1;
        stroke.direction = direction;
        stroke.anchor = x;
      }
      if (stroke.turns >= 2 && stroke.distance >= .38 && now - stroke.startedAt >= 300) { stroke = null; return true; }
      return false;
    },
  };
}
if (typeof module !== 'undefined') module.exports = { createPettingGesture };
else globalThis.YuexinPetting = { createPettingGesture };
