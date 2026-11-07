import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),query:vi.fn()}));
vi.mock('../../src/lib/auth',()=>({auth:{getSession:m.session}}));vi.mock('../../src/lib/db',()=>({db:{query:m.query}}));
import {privacyIdentity} from '../../src/modules/governance/identity';
import {privacyCreate,privacyAction} from '../../src/modules/governance/schema';
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({data:{user:{id:'trusted',email:'trusted@example.test',name:'Provider name',role:'SUPER_ADMIN'}}});m.query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:'trusted',email:'trusted@example.test',name:'Saved display name',role:'RENTER',suspended:true,governance_version:3}]});});
it('permits only a fresh trusted identity in the limited privacy portal while preserving suspension and the stored role/name',async()=>{
 expect(await privacyIdentity()).toMatchObject({id:'trusted',role:'RENTER',name:'Saved display name',suspended:true,version:3});expect(m.session).toHaveBeenCalledWith({query:{disableCookieCache:true}});expect(m.query.mock.calls[0][1]).toEqual(['trusted','trusted@example.test','Provider name']);expect(m.query.mock.calls[0][0]).not.toContain('role=');expect(m.query.mock.calls[0][0]).not.toContain('suspended=');
});
it('does not provide a status identity from a missing or failed provider session',async()=>{
 m.session.mockResolvedValue({data:null,error:{message:'Invalid session'}});await expect(privacyIdentity()).rejects.toMatchObject({status:401});expect(m.query).not.toHaveBeenCalled();
});
it('rejects forged identities, implied consent and unrelated profile fields',()=>{
 const base={idempotencyKey:'365ef66a-beec-48fd-88c7-13245a359e31',kind:'ACCESS',message:'Please review account information.',acknowledged:true};expect(privacyCreate.safeParse({...base,actorId:'foreign'}).success).toBe(false);expect(privacyCreate.safeParse({...base,acknowledged:false}).success).toBe(false);expect(privacyCreate.safeParse({...base,requestedName:'Unrelated change'}).success).toBe(false);expect(privacyCreate.safeParse({...base,kind:'CORRECTION'}).success).toBe(false);expect(privacyAction.safeParse({...base,action:'APPROVE',role:'SUPER_ADMIN'}).success).toBe(false);
});
