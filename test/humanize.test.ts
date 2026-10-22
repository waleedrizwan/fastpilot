import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mousePath, wheelTicks, keyDelay } from '../src/background/humanize.ts';

test('mouse path ends exactly on target for every speed', () => {
  for (const speed of ['instant', 'fast', 'natural'] as const) {
    for (let i = 0; i < 50; i++) {
      const to = { x: Math.random() * 1200, y: Math.random() * 800 };
      const path = mousePath({ x: 10, y: 10 }, to, speed);
      assert.deepEqual({ x: path.at(-1)!.x, y: path.at(-1)!.y }, to);
    }
  }
});

test('fast moves stay quick, natural moves are slower', () => {
  const total = (s: 'fast' | 'natural') => mousePath({ x: 0, y: 0 }, { x: 900, y: 500 }, s).reduce((a, p) => a + p.dt, 0);
  for (let i = 0; i < 20; i++) {
    assert.ok(total('fast') <= 150 * 1.01);
    assert.ok(total('natural') >= 220);
  }
});

test('wheel ticks add up to the requested scroll', () => {
  for (const dy of [800, -640, 37]) {
    const sum = wheelTicks(dy, 'natural').reduce((a, t) => a + t.dy, 0);
    assert.ok(Math.abs(sum - dy) < 0.5);
  }
});

test('instant mode never waits', () => {
  assert.equal(keyDelay('instant', 'a'), 0);
});
