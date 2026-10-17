import { describe, it, expect } from 'vitest';
import { loadStack, saveStack } from './stackStore.js';

// jsdom has no IndexedDB — exactly the "storage unavailable" case (old
// browsers, blocked site data) the stack scanner must survive: loading
// yields an empty stack and saving is a silent no-op, never a crash.
describe('stackStore without IndexedDB', () => {
  it('loads an empty stack', async () => {
    expect(await loadStack('stack:catalog')).toEqual([]);
  });

  it('saves without throwing', async () => {
    await expect(saveStack('stack:catalog', [{ id: 'a' }])).resolves.toBeUndefined();
  });
});
