import {z} from "zod";
export const extraChargeTypes=["DAMAGE","FUEL","LATE_RETURN","CLEANING","CANCELLATION"] as const;
export const extraChargeContexts=["CONSIGNED","AGENCY_OWNED","TOUR_ONLY"] as const;
export const extraChargeLabels={DAMAGE:"Damage",FUEL:"Fuel",LATE_RETURN:"Late return",CLEANING:"Cleaning",CANCELLATION:"Cancellation"};
export const extraContextLabels={CONSIGNED:"Consigned rental",AGENCY_OWNED:"Agency-owned rental",TOUR_ONLY:"Tour-only service"};
const bps=z.number().int().min(0).max(10000),shares=z.object({cosigner:bps.nullable(),agency:bps.nullable(),platform:bps.nullable(),maintenance:bps.nullable()}).strict();
const draft=z.object({type:z.enum(extraChargeTypes),context:z.enum(extraChargeContexts),explanation:z.string().trim().max(4000),shares}).strict();
export const extraChargePolicyList=z.array(draft).max(11);
export type ExtraChargePolicy=z.infer<typeof draft>;
export const completeExtraChargePolicy=draft.superRefine((p,ctx)=>{
 const issue=(path:(string|number)[],message:string)=>ctx.addIssue({code:"custom",path,message});
 if(!p.explanation)issue(["explanation"],"Explain when this charge may be proposed and how it will be reviewed.");
 for(const [key,n]of Object.entries(p.shares))if(n===null)issue(["shares",key],"Set an explicit percentage, including zero if applicable.");
 if(Object.values(p.shares).every(n=>n!==null)&&Object.values(p.shares).reduce<number>((sum,n)=>sum+(n??0),0)!==10000)issue(["shares"],"Extra-charge allocations must total exactly 100%.");
 if(p.context!=="CONSIGNED"&&p.shares.cosigner!==0)issue(["shares","cosigner"],"This service has no vehicle Cosigner; set this share to zero.");
 if(p.context==="TOUR_ONLY"){
  if(p.type!=="CANCELLATION")issue(["context"],"Rental condition/return charges do not apply to tour-only services.");
  if(p.shares.maintenance!==0)issue(["shares","maintenance"],"Tour-only services have no renter vehicle maintenance allocation.");
 }
});
export function policyForCharge(input:unknown,type:string,context:string){
 const parsed=extraChargePolicyList.safeParse(input??[]);if(!parsed.success)return null;const matches=parsed.data.filter(p=>p.type===type&&p.context===context);if(matches.length!==1)return null;const valid=completeExtraChargePolicy.safeParse(matches[0]);return valid.success?valid.data:null;
}
