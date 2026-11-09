// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
const m=vi.hoisted(()=>({actor:vi.fn(),identity:vi.fn(),privacy:vi.fn()}));
vi.mock('@/lib/page-actor',()=>({pageActor:m.actor}));vi.mock('@/modules/account/service',()=>({accountIdentity:m.identity}));vi.mock('@/modules/governance/identity',()=>({privacyIdentity:m.privacy}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error('REDIRECT '+url);},notFound:()=>{throw Error('NOT_FOUND');}}));
vi.mock('@/components/workspace',()=>({Workspace:({children,limited=false}:any)=><main data-limited={limited}>{children}</main>}));
vi.mock('@/components/account-security',()=>({AccountSecurity:()=> <p>Security controls</p>}));
vi.mock('@/components/account-privacy',()=>({AccountPrivacy:({query,limited=false}:any)=><p data-testid="privacy" data-limited={limited}>{JSON.stringify(query)}</p>}));
import Account from '../../src/app/workspace/account/page';
import Legacy from '../../src/app/account-status/page';
const user={id:'person',name:'Person',email:'person@example.test',role:'RENTER',suspended:false,version:1};
beforeEach(()=>{vi.resetAllMocks();m.actor.mockResolvedValue(user);m.identity.mockResolvedValue({id:user.id});m.privacy.mockResolvedValue(user);});afterEach(cleanup);
it('opens security by default and loads privacy within the same account route',async()=>{
 render(await Account({searchParams:Promise.resolve({})}));expect(screen.getByText('Security controls')).toBeTruthy();cleanup();render(await Account({searchParams:Promise.resolve({section:'privacy',view:'ALL',page:'2'})}));expect(screen.getByTestId('privacy').textContent).toBe('{"view":"ALL","page":"2"}');expect(m.privacy).toHaveBeenCalledOnce();
});
it('keeps restricted accounts in their existing limited portal and refuses ambiguous sections',async()=>{
 m.privacy.mockResolvedValue({...user,suspended:true});await expect(Account({searchParams:Promise.resolve({section:'privacy'})})).rejects.toThrow('REDIRECT /account-status');await expect(Account({searchParams:Promise.resolve({section:['privacy','security']})})).rejects.toThrow('NOT_FOUND');
});
it('preserves old privacy links through a canonical account redirect and retains restricted request access',async()=>{
 await expect(Legacy({searchParams:Promise.resolve({view:'ALL',page:'2'})})).rejects.toThrow('REDIRECT /workspace/account?section=privacy&view=ALL&page=2');m.privacy.mockResolvedValue({...user,suspended:true});render(await Legacy({searchParams:Promise.resolve({view:'ALL'})}));expect(screen.getByTestId('privacy').getAttribute('data-limited')).toBe('true');expect(screen.queryByText('Security controls')).toBeNull();await expect(Legacy({searchParams:Promise.resolve({recipientId:'foreign'})})).rejects.toThrow('NOT_FOUND');
});
