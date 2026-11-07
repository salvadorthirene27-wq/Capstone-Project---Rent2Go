import {afterEach,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({requireActor:vi.fn(),getSession:vi.fn()}));
vi.mock('../../src/lib/auth',()=>({requireActor:deps.requireActor,auth:{getSession:deps.getSession}}));
import {accountIdentity} from '../../src/modules/account/service';
afterEach(()=>vi.resetAllMocks());
it('reads fresh verification state while keeping application roles authoritative',async()=>{deps.requireActor.mockResolvedValue({id:'renter',role:'COSIGNER',email:'old@example.test'});deps.getSession.mockResolvedValue({data:{user:{id:'renter',email:'new@example.test',name:'Synthetic',role:'admin',emailVerified:true}}});expect(await accountIdentity()).toEqual({id:'renter',email:'new@example.test',name:'Synthetic',role:'COSIGNER',emailVerified:true});expect(deps.getSession).toHaveBeenCalledWith({query:{disableCookieCache:true}});});
it('rejects a lost or changed session before exposing private identity',async()=>{deps.requireActor.mockResolvedValue({id:'renter',role:'RENTER'});deps.getSession.mockResolvedValueOnce({data:null}).mockResolvedValueOnce({data:{user:{id:'other',email:'other@example.test',emailVerified:true}}});await expect(accountIdentity()).rejects.toMatchObject({status:401});await expect(accountIdentity()).rejects.toMatchObject({status:401});});
