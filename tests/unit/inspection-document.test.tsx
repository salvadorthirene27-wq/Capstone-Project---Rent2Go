import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {it,expect} from "vitest";
import {InspectionDocument} from "../../src/components/inspection-document";
it("preserves exact historical condition, private photo and renter dispute without turning it into a charge",()=>{
 const html=renderToStaticMarkup(<InspectionDocument report={{id:"old-report",phase:"POST",revision:1,digest:"hash",createdAt:"2032-01-01T00:00:00Z",decision:"DISPUTE",reason:"Synthetic disagreement",acknowledgedAt:"2032-01-01T00:10:00Z",body:{odometerKm:1550,fuelEighths:4,cleanliness:"NEEDS_CLEANING",roadworthy:false,safetyChecked:false,damageNotes:"<script>unsafe</script>",photoIds:["private-photo"]}}}/>);
 expect(html).toContain("Return inspection");expect(html).toContain("version 1");expect(html).toContain("Disputed");expect(html).toContain("Synthetic disagreement");expect(html).toContain("/api/inspection-photos/private-photo");expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");expect(html).not.toContain("<script>");expect(html).not.toMatch(/charged|settled/i);
});
