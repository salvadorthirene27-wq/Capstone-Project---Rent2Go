import { beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),actor:vi.fn()}));
vi.mock("../../src/lib/db",()=>({transaction:m.transaction,db:{}}));
vi.mock("../../src/modules/partners/service",()=>({storedActor:m.actor,audit:vi.fn()}));
vi.mock("../../src/modules/bookings/quotation",()=>({lockBookingAuthority:vi.fn()}));
import { getPayments } from "../../src/modules/bookings/payment";
const id="e79318ab-a56e-4cc8-a8b0-a3e4676d7b36";
beforeEach(()=>{vi.resetAllMocks();m.transaction.mockImplementation(fn=>fn({query:m.query}));m.actor.mockResolvedValue({id:"renter",role:"RENTER"});m.query.mockImplementation(async(sql:string)=>{
 if(sql.includes("to_regclass"))return {rows:[{prepared:null,posting:null}],rowCount:1};
 if(sql.startsWith("SELECT id,agency_id,renter_id,status,version"))return {rows:[{id,agency_id:id,renter_id:"renter",status:"REQUIREMENTS_PENDING",version:1}],rowCount:1};
 if(sql.includes("is_test_fixture FROM app_actor"))return {rows:[{is_test_fixture:false}],rowCount:1};
 if(sql.includes("clock_timestamp() AS now"))return {rows:[{now:new Date("2030-01-01T00:00:00Z")}],rowCount:1};
 if(sql.includes("SELECT 1 FROM agency"))return {rows:[{}],rowCount:1};
 if(sql.includes("AS confirmed"))return {rows:[{confirmed:"0"}],rowCount:1};
 return {rows:[],rowCount:0};
 });});
it("pre-agreement GET is a read-only repeatable snapshot with no invented balance or mutation",async()=>{
 const state=await getPayments({id:"renter",role:"RENTER"},id);expect(state).toMatchObject({serverNow:"2030-01-01T00:00:00.000Z",requestVersion:1,agreement:null,environment:null,canSubmitGcash:false,canSimulate:false,canRecordCash:false,totals:{serviceCentavos:0,refundableDepositCentavos:0,totalCentavos:0,confirmedCentavos:0,balanceCentavos:0,creditCentavos:0}});
 expect(m.query.mock.calls[0][0]).toBe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");expect(m.query.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
});
it("enables resolution only for the renter's pending demo on the current signed allocation",async()=>{
 m.query.mockImplementation(async(sql:string)=>{
  if(sql.includes("to_regclass"))return {rows:[{prepared:null,posting:null}],rowCount:1};
  if(sql.startsWith("SELECT id,agency_id,renter_id,status,version"))return {rows:[{id,agency_id:id,renter_id:"renter",status:"AGREEMENT_SIGNED",version:1}],rowCount:1};
  if(sql.startsWith("SELECT q.id"))return {rows:[{id:"current-quote",digest:"quote-digest",totals:{serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300}}],rowCount:1};
  if(sql.startsWith("SELECT h.id"))return {rows:[{id:"hold",expires_at:new Date("2031-01-01Z"),released_at:null,live:true,committed:false}],rowCount:1};
  if(sql.startsWith("SELECT a.id,a.digest"))return {rows:[{id:"current-agreement",digest:"signed-digest",quote_digest:"quote-digest",agreement_digest:"signed-digest",signature_id:"signature",withdrawn:false}],rowCount:1};
  if(sql.startsWith("SELECT id,environment"))return {rows:[{id:"account",environment:"DEMO",agreement_id:"current-agreement"}],rowCount:1};
  if(sql.startsWith("SELECT t.id,t.method"))return {rows:[{id:"current",method:"DEMO_CARD",environment:"DEMO",amount_centavos:"300",reference:"DEMO-current",outcome:"PENDING",submitted_at:new Date("2030-01-01Z"),reason:null,file_id:null,collection_id:null,quote_id:"current-quote",agreement_id:"current-agreement",actor_id:"renter"},{id:"historical",method:"DEMO_CARD",environment:"DEMO",amount_centavos:"300",reference:"DEMO-old",outcome:"PENDING",submitted_at:new Date("2029-01-01Z"),reason:null,file_id:null,collection_id:null,quote_id:"old-quote",agreement_id:"old-agreement",actor_id:"renter"}],rowCount:2};
  if(sql.includes("AS confirmed"))return {rows:[{confirmed:"0"}],rowCount:1};
  if(sql.includes("clock_timestamp() AS now"))return {rows:[{now:new Date("2030-01-01Z")}],rowCount:1};
  if(sql.includes("SELECT 1 FROM agency")||sql.includes("SELECT 1 FROM booking_quotation_decision"))return {rows:[{}],rowCount:1};
  return {rows:[],rowCount:0};
 });
 const s=await getPayments({id:"renter",role:"RENTER"},id);expect(s.attempts.find(t=>t.id==="current")).toMatchObject({canResolve:true});expect(s.attempts.find(t=>t.id==="historical")).toMatchObject({canResolve:false});
});
