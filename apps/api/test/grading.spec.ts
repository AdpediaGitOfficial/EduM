/** Unit tests for grading + asset depreciation helpers. */
import { gradeFor, gpaFor } from '../src/modules/gradebook.module';
import { currentValue } from '../src/modules/assets.module';

describe('grading scale', () => {
  it('maps percentages to grades', () => {
    expect(gradeFor(95)).toBe('A+');
    expect(gradeFor(90)).toBe('A+');
    expect(gradeFor(85)).toBe('A');
    expect(gradeFor(72)).toBe('B+');
    expect(gradeFor(65)).toBe('B');
    expect(gradeFor(55)).toBe('C');
    expect(gradeFor(45)).toBe('D');
    expect(gradeFor(20)).toBe('F');
  });

  it('maps percentages to GPA (10-point scale)', () => {
    expect(gpaFor(95)).toBe(10);
    expect(gpaFor(82)).toBe(9);
    expect(gpaFor(75)).toBe(8);
    expect(gpaFor(61)).toBe(7);
    expect(gpaFor(50)).toBe(6);
    expect(gpaFor(41)).toBe(5);
    expect(gpaFor(10)).toBe(0);
  });
});

describe('asset straight-line depreciation', () => {
  it('returns full cost with no rate or purchase date', () => {
    expect(currentValue(1000, 0, null)).toBe(1000);
    expect(currentValue(1000, 10, null)).toBe(1000);
  });

  it('depreciates linearly and floors at zero', () => {
    const oneYearAgo = new Date(Date.now() - 365.25 * 86400000);
    expect(currentValue(1000, 20, oneYearAgo)).toBeCloseTo(800, 0);
    const tenYearsAgo = new Date(Date.now() - 10 * 365.25 * 86400000);
    expect(currentValue(1000, 20, tenYearsAgo)).toBe(0);
  });
});
