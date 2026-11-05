import {it,expect} from "vitest";
import {fulfillmentCommand,inspectionBody,fulfillmentStage} from "../../src/modules/bookings/fulfillment-schema";
const id="e79318ab-a56e-4cc8-a8b0-a3e4676d7b36",condition={odometerKm:1500,fuelEighths:6,cleanliness:"CLEAN",damageNotes:"Existing rear bumper scratch.",roadworthy:true,safetyChecked:true};
it("binds exact evidence and validates condition without accepting prices or unsafe release reports",()=>{
 expect(inspectionBody.parse({...condition,photoIds:[id]}).odometerKm).toBe(1500);
 for(const changed of [{...condition,odometerKm:-1},{...condition,fuelEighths:9},{...condition,photoIds:[]},{...condition,chargeCentavos:100}])expect(inspectionBody.safeParse({...changed,photoIds:'photoIds' in changed?changed.photoIds:[id]}).success).toBe(false);
 const ack={action:"ACK_INSPECTION",version:1,idempotencyKey:id,lineId:id,inspectionId:id,digest:"a".repeat(64),decision:"DISPUTE",reason:"Damage description differs."};expect(fulfillmentCommand.safeParse(ack).success).toBe(true);expect(fulfillmentCommand.safeParse({...ack,reason:""}).success).toBe(false);expect(fulfillmentCommand.safeParse({...ack,actorId:id}).success).toBe(false);
});
it("derives physical fulfillment independently of inspection disputes and financial completion",()=>{
 expect(fulfillmentStage("RENTAL",null,null)).toBe("NOT_STARTED");expect(fulfillmentStage("RENTAL","RELEASE_RENTAL",null)).toBe("RENTAL_ACTIVE");expect(fulfillmentStage("RENTAL","RECORD_RETURN","DISPUTE")).toBe("RETURN_DISPUTED");expect(fulfillmentStage("RENTAL","RECORD_RETURN","ACCEPT")).toBe("RETURNED");expect(fulfillmentStage("TOUR","COMPLETE_TOUR",null)).toBe("TOUR_COMPLETED");
});
