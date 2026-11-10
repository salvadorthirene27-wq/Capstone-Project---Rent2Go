import { defaultApplication, draftApplicationSchema } from "../schema";

export const vsmePublicSource = "https://www.facebook.com/VSMETravelandTours";

export function vsmeApplicationDraft(email: string) {
  return draftApplicationSchema.parse({
    ...defaultApplication,
    businessName: "VSME Travel and Tours",
    email,
    phone: "+63 917 192 6089",
    serviceAreas: "Legazpi City, Albay and the Bicol Region. Ask the agency about tours beyond Bicol.",
    supportContact: vsmePublicSource,
    services: ["SELF_DRIVE", "WITH_DRIVER", "GROUP_TOUR", "PRIVATE_TOUR"],
    billingUnit: "12_HOUR",
    split: { cosigner: 8000, agency: 2000, platform: 0, maintenance: 0 },
    nonConsignedShares: { platform: defaultApplication.split.platform, maintenance: defaultApplication.split.maintenance },
    minimumTourHours: 12,
    renterIdsAtHandover: 2,
    eligibilityTerms: "Renters must present two valid IDs in person. Self-drive renters must present a valid driver's license. Cosigners present their vehicle registration and driver's license.",
    terms: [
      "A signed consignment contract is required before the cosigner hands over the vehicle. The agency evaluates documents and negotiates contracts in person at its main office or an arranged physical meeting.",
      "Consigned rental revenue is split 80% to the cosigner and 20% to VSME. VSME's share is its commission. The refundable security deposit is separate.",
      "Personal information, vehicle documents and signed contracts are confidential. Rental agreements are signed and handled under the agency's non-disclosure terms.",
      "Full payment and the refundable security deposit are due before the agency releases the vehicle. Dedicated chauffeur and self-drive bookings are available.",
      "Exclusive packages are private to a single group. Joint packages combine independent groups or individual travelers. Promotions state a title, destination, description and, for joint packages, clear per-traveler pricing and terms.",
      "The minimum booking block is 12 hours. The full agreed rate applies even if the vehicle is returned or the service ends early.",
    ].join("\n\n"),
    refundPolicy: "The refundable security deposit is returned after the agency clears the vehicle on return.",
    latePolicy: "Rental time is billed in 12-hour blocks. An overrun triggers at least one full additional 12-hour block at the agreed overdue rate.",
    inclusions: "Advertised services include airport pickup and drop-off, self-drive vehicle hire, transport for weddings and special occasions, family or barkada outings, conventions, seminars, team building and tours. The accepted quotation states the actual vehicle, chauffeur, itinerary and inclusions.",
    exclusions: "Prices, available units, seats, dates, inclusions, and any extras must be confirmed by VSME before they are offered for booking.",
  });
}
