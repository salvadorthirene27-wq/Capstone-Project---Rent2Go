import {it,expect,vi,afterEach} from 'vitest';
const m=vi.hoisted(()=>({connect:vi.fn()}));
vi.mock('pg',()=>({Pool:class{connect=m.connect;listenerCount(){return 1;}on(){return this;}}}));
import {transaction} from '../../src/lib/db';
afterEach(()=>vi.clearAllMocks());
it('keeps the original callback failure when rollback loses its connection and does not replay work',async()=>{
 const original=Object.assign(new Error('Original connection failure'),{code:'ECONNRESET'}),query=vi.fn(async(sql:string)=>{if(sql==='ROLLBACK')throw Error('Rollback no longer queryable');}),release=vi.fn();m.connect.mockResolvedValue({query,release});
 const work=vi.fn(async()=>{throw original;});await expect(transaction(work)).rejects.toBe(original);expect(work).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledTimes(1);
});
it('does not claim success or retry after an uncertain commit failure',async()=>{
 const original=Object.assign(new Error('Commit outcome uncertain'),{code:'ECONNRESET'}),query=vi.fn(async(sql:string)=>{if(sql==='COMMIT'||sql==='ROLLBACK')throw original;}),release=vi.fn();m.connect.mockResolvedValue({query,release});
 const work=vi.fn(async()=>42);await expect(transaction(work)).rejects.toBe(original);expect(work).toHaveBeenCalledTimes(1);expect(query.mock.calls.map(c=>c[0])).toEqual(['BEGIN','COMMIT','ROLLBACK']);expect(release).toHaveBeenCalledTimes(1);
});
