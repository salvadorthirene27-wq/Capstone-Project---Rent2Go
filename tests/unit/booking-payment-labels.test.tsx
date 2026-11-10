import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {it,expect} from "vitest";
import {BookingList} from "../../src/components/booking-list";
import {BookingDetail} from "../../src/components/booking-detail";
const item=(paymentEnvironment:"MANUAL"|"DEMO")=>({id:"booking-id",agencyId:"agency-id",agencyName:"Synthetic agency",status:"READY_FOR_SERVICE",version:1,contact:{name:"Synthetic renter",phone:"synthetic",email:"demo@example.test",notes:""},createdAt:"2032-01-01T00:00:00Z",preview:null,paymentEnvironment});
for(const environment of ["DEMO","MANUAL"] as const)it(`keeps ${environment} collection identity visible in booking queues and details`,()=>{
 const row=item(environment),queue=renderToStaticMarkup(<BookingList list={{items:[row],total:1,page:1,pageCount:1}} base="/workspace/bookings"/>),detail=renderToStaticMarkup(<BookingDetail booking={{...row,isOwnRequest:true,lines:[],events:[],totals:{serviceCentavos:100,refundableDepositCentavos:200,estimatedDueCentavos:300}}}/>);
 for(const html of [queue,detail])if(environment==="DEMO")expect(html).toContain("Simulated payment · no charge");else expect(html).not.toContain("Simulated payment · no charge");
});
