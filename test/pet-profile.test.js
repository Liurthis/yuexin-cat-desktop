const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePetName } = require('../src/pet-profile');
const { journalText, normalizeJournal } = require('../src/journal');
test('pet nicknames migrate safely, count Unicode characters, and cannot add control lines', () => {
  assert.equal(normalizePetName(undefined), '月薪喵');
  assert.equal(normalizePetName('  '), '月薪喵');
  assert.equal(normalizePetName(' 小月亮🐾\n\t '), '小月亮🐾');
  assert.equal(Array.from(normalizePetName('🐱'.repeat(20))).length, 12);
  assert.equal(journalText(normalizeJournal(), '小月亮🐾').split('\r\n')[0], '小月亮🐾的陪伴日记');
});
