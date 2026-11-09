import { afterEach, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ db: { query } }));
import { GET } from '../../src/app/healthz/route';
afterEach(() => vi.resetAllMocks());
it('reports database readiness without exposing credentials or operational records', async () => {
  query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
  const response = await GET();
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'ok' }); expect(query).toHaveBeenCalledWith('SELECT 1');
});
it('reports unavailable safely when the hosted database is unreachable', async () => {
  query.mockRejectedValue(Error('sensitive connection information'));
  const response = await GET(); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: 'unavailable' });
});
