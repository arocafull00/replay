import { describe, expect, it } from 'vitest';
import { BufferBudget, cameraError, isDelay, MAX_BYTES, synchronization } from '../../src/lib/video/policy';
describe('buffer and synchronization policy', () => {
  it('accepts only the five configured delays', () => {
    for (const delay of [5, 10, 15, 20, 30]) expect(isDelay(delay)).toBe(true);
    for (const delay of [0, 11, '10', null, NaN]) expect(isDelay(delay)).toBe(false);
  });
  it('evicts played data and rejects allocations over the compressed budget', () => {
    const budget = new BufferBudget();
    budget.add(1, 100); budget.add(2, 200); budget.add(3, 300);
    budget.removeBefore(2); expect(budget.bytes).toBe(500);
    expect(() => budget.add(4, MAX_BYTES)).toThrow(/memoria/);
    budget.clear(); expect(budget.bytes).toBe(0);
  });
  it('makes bounded corrections without seeking on normal jitter', () => {
    expect(synchronization(10, 9.9)).toEqual({ seek: null, rate: 1 });
    expect(synchronization(10, 9.5).rate).toBeCloseTo(1.05);
    expect(synchronization(10, 10.5).rate).toBeCloseTo(.95);
    expect(synchronization(10, 8)).toEqual({ seek: 10, rate: 1 });
  });
  it('gives actionable camera errors', () => {
    expect(cameraError(new DOMException('', 'NotAllowedError'))).toMatch(/permiso/);
    expect(cameraError(new DOMException('', 'NotReadableError'))).toMatch(/otras aplicaciones/);
    expect(cameraError(new DOMException('', 'NotFoundError'))).toMatch(/cámara/);
  });
});
