export const onboardingPaths = {
  renter: { label: "Renter", href: "/rentals", action: "Browse rentals" },
  cosigner: {
    label: "Cosigner",
    href: "/workspace/vehicles/new",
    action: "Offer a vehicle",
  },
  agency: {
    label: "Agency partner",
    href: "/workspace/application",
    action: "Start your agency application",
  },
} as const;

export type OnboardingPath = keyof typeof onboardingPaths;

export function parseOnboardingPath(value: unknown): OnboardingPath | undefined {
  if (value === "renter" || value === "cosigner" || value === "agency") return value;
}
