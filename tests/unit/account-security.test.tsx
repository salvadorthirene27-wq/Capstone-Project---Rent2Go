// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {AccountSecurity} from '../../src/components/account-security';
const account={id:'renter',email:'renter@example.test',name:'Synthetic',role:'RENTER' as const,emailVerified:false};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('requests verification only on explicit click, pins the account email server-side and prevents repeat sends',async()=>{
 const user=userEvent.setup(),fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({account,message:'Code requested.'})));vi.stubGlobal('fetch',fetcher);render(<AccountSecurity initial={account}/>);expect(fetcher).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Send verification code'}));await screen.findByRole('status');expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({action:'SEND_VERIFICATION'});const again=screen.getByRole('button',{name:/Request another code in/});await user.click(again);expect(fetcher).toHaveBeenCalledOnce();
});
it('submits a pasted code only after explicit verification and shows the authoritative verified result',async()=>{
 const user=userEvent.setup(),fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({account:{...account,emailVerified:true},message:'Verified.'})));vi.stubGlobal('fetch',fetcher);render(<AccountSecurity initial={account}/>);await user.click(screen.getByRole('button',{name:'Verify email'}));expect(fetcher).not.toHaveBeenCalled();const input=screen.getByRole('textbox',{name:'Verification code'});await user.click(input);await user.paste('123456');expect(fetcher).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Verify email'}));await screen.findByText('Email verified');expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({action:'VERIFY_EMAIL',code:'123456'});expect(screen.queryByRole('textbox',{name:'Verification code'})).toBeNull();
});
it('clears private identity on denied refresh and aborts reads when unmounted',async()=>{
 const user=userEvent.setup(),fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Sign in again.'}),{status:401}));vi.stubGlobal('fetch',fetcher);render(<AccountSecurity initial={account}/>);await user.click(screen.getByRole('button',{name:'Refresh account status'}));await screen.findByRole('alert');expect(screen.queryByText(account.email)).toBeNull();cleanup();const pending=vi.fn().mockReturnValue(new Promise(()=>{}));vi.stubGlobal('fetch',pending);const view=render(<AccountSecurity initial={account}/>);await user.click(screen.getByRole('button',{name:'Refresh account status'}));await waitFor(()=>expect(pending).toHaveBeenCalledOnce());const signal=pending.mock.calls[0][1].signal;view.unmount();expect(signal.aborted).toBe(true);
});
