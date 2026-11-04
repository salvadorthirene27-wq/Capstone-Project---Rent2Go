import { describe, it, expect } from 'vitest';
import { requiredPurposes, validateExpiry, requirementsCommand } from '../../src/modules/bookings/requirements-schema';
describe('booking requirements rules', () => {
    it('requires license only for self drive', () => { expect(requiredPurposes([{ selection: { kind: 'RENTAL', mode: 'SELF_DRIVE' } }])).toEqual(['IDENTITY', 'DRIVER_LICENSE']); expect(requiredPurposes([{ selection: { kind: 'TOUR' } }])).toEqual(['IDENTITY']); });
    it('acceptance requires license expiry covering service end', () => { expect(() => validateExpiry('DRIVER_LICENSE', null, '2026-12-01')).toThrow(); expect(() => validateExpiry('IDENTITY', '2026-11-30', '2026-12-01')).toThrow(); expect(() => validateExpiry('DRIVER_LICENSE', '2026-12-01', '2026-12-01')).not.toThrow(); });
    it('validates dates and bounded reasons', () => { expect(() => validateExpiry('IDENTITY', '2026-02-30', '2026-02-01')).toThrow(); expect(requirementsCommand.safeParse({ action: 'REJECT', version: 1, reason: '' }).success).toBe(false); expect(requirementsCommand.safeParse({ action: 'REVIEW_DOCUMENT', version: 1, fileId: 'd72285dd-4505-489e-a4a7-c72d34cc37e8', decision: 'CHANGES_REQUESTED' }).success).toBe(false); });
});
