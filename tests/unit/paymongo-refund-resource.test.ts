import {createHash,randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {parseRefundResource,matchRefundResource,advanceRefundObservation,providerRefundBudget} from '../../src/modules/gateway/refund-resource';
import {payMongoClient,type PayMongoConfig} from '../../src/modules/gateway/paymongo';
const config:PayMongoConfig={mode:'test',secretKey:'sk_test_refundfixture12345678',webhookSecret:'',methods:['card'],notificationMode:'poll'};
const merchant=createHash('sha256').update(config.secretKey).digest('hex');
const intentId=randomUUID();
const saved={id:intentId,paymentId:'pay_original123',mode:'test',merchantFingerprint:merchant,amountCentavos:2500,originalPaymentCentavos:10000,providerRefundId:'ref_original123'};
function resource():any{return {id:'ref_original123',type:'refund',attributes:{amount:2500,currency:'PHP',livemode:false,payment_id:'pay_original123',status:'pending',created_at:1800000000,updated_at:1800000001,metadata:{rent2go_refund:intentId,private_contact:'DO_NOT_PERSIST'},notes:'PRIVATE REFUND NOTES',billing:{email:'PRIVATE EMAIL'},payout_id:'PRIVATE PAYOUT'}};}
const parsed=()=>parseRefundResource(resource(),'test');
const reserve=(status='PREPARED',amountCentavos=2500)=>({id:randomUUID(),paymentId:saved.paymentId,mode:'test',merchantFingerprint:merchant,amountCentavos,providerRefundId:status==='SUCCEEDED'?'ref_'+randomUUID().replaceAll('-',''):null,status});
const budget=(refunds:unknown[])=>({paymentId:saved.paymentId,mode:'test',merchantFingerprint:merchant,grossCentavos:10000,refunds});

it('projects only refund identity, exact amounts, mode, source, status, time and opaque reference',()=>{
 const r=parsed();expect(r).toEqual({id:'ref_original123',paymentId:'pay_original123',mode:'test',amountCentavos:2500,currency:'PHP',status:'pending',createdAt:1800000000,updatedAt:1800000001,reference:intentId});expect(JSON.stringify(r)).not.toMatch(/PRIVATE|DO_NOT_PERSIST|billing|notes|payout/);
 const external=resource();delete external.attributes.metadata;expect(parseRefundResource(external,'test').reference).toBeNull();expect(()=>matchRefundResource(saved,parseRefundResource(external,'test'),config)).toThrow();
});
it.each(['pending','processing','succeeded','failed'])('preserves provider status %s without inventing a bank receipt',status=>{
 const raw=resource();raw.attributes.status=status;const r=parseRefundResource(raw,'test');expect(r.status).toBe(status);expect(r).not.toHaveProperty('renterReceived');expect(r).not.toHaveProperty('feeReversed');
});
it('rejects mode, currency, refund type, malformed IDs, unsafe amounts, invalid metadata and time reversal',()=>{
 for(const change of [{livemode:true},{currency:'USD'},{amount:0},{amount:99},{amount:1.5},{amount:2147483648},{status:'cancelled'},{payment_id:'../../payment'},{created_at:1800000002},{updated_at:-1},{metadata:{rent2go_refund:'foreign'}}]){const raw=resource();Object.assign(raw.attributes,change);expect(()=>parseRefundResource(raw,'test')).toThrow();}
 for(const change of [{type:'payment'},{id:'ref_../foreign'},{id:'pay_original123'}])expect(()=>parseRefundResource({...resource(),...change},'test')).toThrow();
});
it('matches the saved merchant, payment, environment, amount, reference and provider mapping',()=>{
 expect(matchRefundResource(saved,parsed(),config)).toEqual(parsed());expect(matchRefundResource({...saved,providerRefundId:null},parsed(),config).id).toBe('ref_original123');
 for(const change of [{id:randomUUID()},{paymentId:'pay_other123'},{mode:'live'},{merchantFingerprint:'f'.repeat(64)},{amountCentavos:2400},{originalPaymentCentavos:2000},{providerRefundId:'ref_other123'}])expect(()=>matchRefundResource({...saved,...change},parsed(),config)).toThrow();
 expect(()=>matchRefundResource(saved,parsed(),{...config,secretKey:'sk_test_changedkey12345678'})).toThrow();expect(()=>matchRefundResource({...saved,clientOutcome:'succeeded'},parsed(),config)).toThrow();
});
it('advances pending and processing observations to a verified terminal state once',()=>{
 const p=parsed(),processing={...p,status:'processing' as const,updatedAt:p.updatedAt+1},succeeded={...processing,status:'succeeded' as const,updatedAt:p.updatedAt+2};
 expect(advanceRefundObservation(null,p)).toMatchObject({changed:true,stale:false});expect(advanceRefundObservation(p,processing).refund.status).toBe('processing');expect(advanceRefundObservation(processing,succeeded).refund.status).toBe('succeeded');expect(advanceRefundObservation(succeeded,succeeded)).toEqual({refund:succeeded,changed:false,stale:false});expect(advanceRefundObservation(p,{...p,status:'failed'}).refund.status).toBe('failed');
});
it('ignores stale nonterminal observations but sends conflicting terminal outcomes and identity changes to reconciliation',()=>{
 const p=parsed(),done={...p,status:'succeeded' as const,updatedAt:p.updatedAt+2};expect(advanceRefundObservation(done,p)).toEqual({refund:done,changed:false,stale:true});
 for(const change of [{status:'failed',updatedAt:done.updatedAt+1},{status:'processing',updatedAt:done.updatedAt+1},{paymentId:'pay_other123'},{id:'ref_other123'},{amountCentavos:2501},{reference:randomUUID()},{createdAt:p.createdAt-1}])expect(()=>advanceRefundObservation(done,{...done,...change})).toThrow();
 expect(()=>advanceRefundObservation({...p,status:'failed'},{...done,updatedAt:p.updatedAt+1})).toThrow();expect(()=>advanceRefundObservation({...p,status:'processing'},{...p,updatedAt:p.updatedAt+1})).toThrow();
});
it('reserves prepared, ambiguous and in-flight amounts against gross rather than guessing an outcome',()=>{
 const v=providerRefundBudget(budget([reserve('SUCCEEDED',2000),reserve('UNKNOWN',1000),reserve('PENDING',1000),reserve('PROCESSING',1000),reserve('PREPARED',1000),reserve('DISPATCHING',1000),reserve('FAILED',1000),reserve('CANCELLED_BEFORE_DISPATCH',1000)]));expect(v).toEqual({originalGrossCentavos:10000,verifiedRefundedCentavos:2000,reservedCentavos:5000,availableForRefundCentavos:3000,hasUnresolved:true});
 expect(providerRefundBudget(budget([reserve('FAILED')]))).toMatchObject({availableForRefundCentavos:10000,hasUnresolved:false});
});
it('rejects foreign source mixing, duplicate intents/provider refunds and over-allocation',()=>{
 const first=reserve('SUCCEEDED');for(const change of [{paymentId:'pay_other123'},{mode:'live'},{merchantFingerprint:'f'.repeat(64)},{providerRefundId:null}])expect(()=>providerRefundBudget(budget([{...first,...change}]))).toThrow();
 expect(()=>providerRefundBudget(budget([first,first]))).toThrow();expect(()=>providerRefundBudget(budget([first,{...first,id:randomUUID()}]))).toThrow();expect(()=>providerRefundBudget(budget([reserve('SUCCEEDED',6000),reserve('UNKNOWN',5000)]))).toThrow();expect(()=>providerRefundBudget(budget([{...first,status:'CANCELLED_BEFORE_DISPATCH'}]))).toThrow();
});
it('uses integer arithmetic for a fully refunded gross and never implicitly refunds the processing fee',()=>{
 const result=providerRefundBudget(budget([reserve('SUCCEEDED',10000)]));expect(result).toMatchObject({verifiedRefundedCentavos:10000,availableForRefundCentavos:0});expect(result).not.toHaveProperty('providerFeeRefundedCentavos');
 const max=providerRefundBudget({...budget([]),grossCentavos:Number.MAX_SAFE_INTEGER});expect(max.availableForRefundCentavos).toBe(Number.MAX_SAFE_INTEGER);
});
it('retrieves the exact provider resource through a bounded, nonredirecting, authenticated GET',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data:resource()})),r=await payMongoClient(config,fetcher).retrieveRefund('ref_original123');expect(r).toEqual(parsed());expect(fetcher).toHaveBeenCalledOnce();const [url,init]=fetcher.mock.calls[0];expect(url).toBe('https://api.paymongo.com/v1/refunds/ref_original123');expect(init).toMatchObject({method:'GET',redirect:'error',cache:'no-store'});expect(init?.body).toBeUndefined();expect((init?.headers as any).Authorization).toBe('Basic '+Buffer.from(config.secretKey+':').toString('base64'));
});
it('rejects path injection before dispatch and a provider ID substitution after retrieval',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({data:{...resource(),id:'ref_other123'}})),client=payMongoClient(config,fetcher);await expect(client.retrieveRefund('ref_../other')).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();await expect(client.retrieveRefund('ref_original123')).rejects.toThrow(/different refund/);expect(fetcher).toHaveBeenCalledOnce();
});
it('redacts provider errors and never issues a second request after an ambiguous connection failure',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockRejectedValue(Error('PRIVATE UPSTREAM TOKEN'));await expect(payMongoClient(config,fetcher).retrieveRefund('ref_original123')).rejects.toThrow('Online payments are temporarily unavailable. Try again shortly.');expect(fetcher).toHaveBeenCalledOnce();
 const denied=vi.fn<typeof fetch>().mockResolvedValue(Response.json({errors:[{detail:'PRIVATE UPSTREAM TOKEN'}]},{status:401}));let message='';try{await payMongoClient(config,denied).retrieveRefund('ref_original123');}catch(error){message=(error as Error).message;}expect(message).toContain('credentials need review');expect(message).not.toContain('PRIVATE');
});
