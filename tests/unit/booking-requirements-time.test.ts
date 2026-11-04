import { it, expect } from 'vitest';
import { serviceEndDate } from '../../src/modules/bookings/requirements-schema';
it('compares license expiry to the Manila calendar date of service end', () => { expect(serviceEndDate('2031-09-01T20:00:00Z')).toBe('2031-09-02'); });
