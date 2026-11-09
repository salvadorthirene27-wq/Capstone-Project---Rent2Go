/** @vitest-environment jsdom */
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
const state=vi.hoisted(()=>({value:{} as any,send:vi.fn(),load:vi.fn()}));
vi.mock('@/components/use-financial-record',()=>({useFinancialRecord:()=>({data:state.value,send:state.send,load:state.load,blocked:false,loading:false,busy:false,error:'',message:''})}));
import {CentralDisbursementPanel} from '../../src/components/central-disbursements';
beforeEach(()=>{vi.clearAllMocks();state.send.mockResolvedValue(undefined);state.value={canRequest:false,pageCount:1,page:1,items:[{id:'original',revision:1,amountCentavos:8500,requestReason:'Please review the original agency destination',stage:'APPROVED',environment:'DEMO',createdAt:'2026-11-10T00:00:00Z',destination:{name:'Coastal Mobility',institution:'Example Bank',method:'BANK',account:'0000000000'},sources:[],history:[],stale:false,transfer:null,confirmedAt:null,canApprove:false,canReject:false,canWithdraw:false,canTransfer:true,canConfirm:false}]};});
afterEach(cleanup);
it('requires explicit test-transfer attestation and a reference without showing receipt confirmation prematurely',()=>{
 render(<CentralDisbursementPanel requestId="booking"/>);expect(screen.queryByRole('button',{name:'Confirm agency receipt'})).toBeNull();const button=screen.getByRole('button',{name:'Record transfer'}) as HTMLButtonElement;expect(button.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Review / confirmation notes'),{target:{value:'Exact amount reviewed'}});fireEvent.change(screen.getByLabelText('Transfer reference'),{target:{value:'TRANSFER-REF'}});expect(button.disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);
 expect(state.send).toHaveBeenCalledWith({action:'SIMULATE_TRANSFER',disbursementId:'original',reason:'Exact amount reviewed',reference:'TRANSFER-REF'},undefined);expect(screen.getByText(/Request notes: Please review/)).toBeTruthy();
});
it('requires an explicit independent receipt confirmation and keeps transfer execution absent after recording',()=>{
 Object.assign(state.value.items[0],{stage:'TRANSFERRED',canTransfer:false,canConfirm:true,transfer:{id:'transfer',reference:'ORIGINAL-REF',recordedAt:'2026-11-10T01:00:00Z',simulated:true,evidenceId:null}});
 render(<CentralDisbursementPanel requestId="booking"/>);expect(screen.queryByRole('button',{name:'Record transfer'})).toBeNull();const button=screen.getByRole('button',{name:'Confirm agency receipt'}) as HTMLButtonElement;expect(button.disabled).toBe(true);fireEvent.change(screen.getByLabelText('Review / confirmation notes'),{target:{value:'Receipt checked'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);expect(state.send).toHaveBeenCalledWith({action:'CONFIRM_RECEIPT',disbursementId:'original',reason:'Receipt checked',received:true},undefined);
});
