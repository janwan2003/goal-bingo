import test from 'node:test';
import assert from 'node:assert/strict';
import { lines, completedLines, friendSlots, freeCell, cellKind, ownCount, clean, pickIdeas, IDEAS } from '../../public/js/bingo.js';

test('friend squares: one per row and per column, never the free centre', () => {
  for (const size of [3, 4, 5]) {
    const slots = friendSlots(size);
    assert.equal(slots.length, size);
    assert.equal(new Set(slots.map((p) => Math.floor(p / size))).size, size, 'rows');
    assert.equal(new Set(slots.map((p) => p % size)).size, size, 'cols');
    assert.ok(!slots.includes(freeCell(size)));
    assert.ok(slots.every((p) => p >= 0 && p < size * size));
  }
});

test('every line contains a friend square or the free centre', () => {
  for (const size of [3, 4, 5]) {
    for (const line of lines(size)) {
      assert.ok(line.some((p) => cellKind(size, p) !== 'own'), `size ${size} line ${line}`);
    }
  }
});

test('counts', () => {
  assert.equal(ownCount(5), 19);
  assert.equal(ownCount(4), 12);
  assert.equal(ownCount(3), 6);
  assert.equal(lines(5).length, 12);
  assert.equal(lines(3).length, 8);
});

test('completed lines use the free centre', () => {
  assert.equal(completedLines(5, new Set([10, 11, 13, 14])).length, 1); // middle row
  assert.equal(completedLines(5, new Set([0, 6, 18, 24])).length, 1); // diagonal through centre
  assert.equal(completedLines(5, new Set([0, 1, 2, 3])).length, 0);
  assert.equal(completedLines(3, new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])).length, 8);
});

test('clean trims, collapses and cuts', () => {
  assert.equal(clean('  a \n  b\u2028c ', 10), 'a b c');
  assert.equal(clean('x'.repeat(100), 60).length, 60);
  assert.equal(clean(null, 5), '');
});

test('pickIdeas avoids duplicates and existing squares', () => {
  const got = pickIdeas(10, ['Read 12 books'], 'seed');
  assert.equal(got.length, 10);
  assert.equal(new Set(got).size, 10);
  assert.ok(!got.includes('Read 12 books'));
  assert.ok(got.every((g) => IDEAS.includes(g)));
  assert.deepEqual(pickIdeas(3, [], 'a'), pickIdeas(3, [], 'a'));
});
