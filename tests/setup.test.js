import { describe, it, expect } from 'vitest';

describe('Setup Test', () => {
  it('should pass basic sanity check', () => {
    expect(true).toBe(true);
  });

  it('should verify vitest is working', () => {
    const sum = 1 + 1;
    expect(sum).toBe(2);
  });
});
