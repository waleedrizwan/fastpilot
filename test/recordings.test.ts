import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordingKey, stepSummary } from '../src/shared/recordings.ts';

test('same task with different spacing, case or trailing punctuation shares a key', () => {
  const a = recordingKey('https://shop.example', 'Add a  blue mug to the cart.');
  const b = recordingKey('https://shop.example', 'add a blue mug to the cart');
  assert.equal(a, b);
  assert.notEqual(a, recordingKey('https://other.example', 'add a blue mug to the cart'));
});

test('step summary names the element and value', () => {
  const s = stepSummary({ tool: 'type', args: { text: 'Jo' }, target: { tag: 'input', role: null, label: 'Full name', css: '#name', nth: 0 } });
  assert.equal(s, 'type "Full name" ← "Jo"');
});

test('step summary names the row of a look-alike', () => {
  const s = stepSummary({ tool: 'click', args: {}, target: { tag: 'button', role: null, label: 'Delete', css: null, nth: 1, row: { text: 'Beta Marco', depth: 2 } } });
  assert.equal(s, 'click "Delete" (row "Beta Marco")');
});
