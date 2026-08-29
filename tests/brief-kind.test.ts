import { expect, it } from 'vitest';
import { briefKindBadge } from '@/lib/brief-kind';

it('labels Sunday week-ahead notes separately from Saturday reviews', () => {
  expect(briefKindBadge('weekend', 'Week Ahead, Sunday, August 23, 2026')?.label).toBe('Week ahead');
  expect(briefKindBadge('weekend', 'Weekend Review, Saturday, August 29, 2026')?.label).toBe(
    'Weekend review',
  );
  expect(briefKindBadge('daily', 'Macro Brief, Friday, August 28, 2026')).toBeNull();
});
