---
name: Rent2Go
description: Visual continuity with the user-approved develop interface
colors:
  forest: "#2F5D50"
  forest-deep: "#254A40"
  mint: "#ABD1C6"
  soft-mint: "#EAF2EF"
  background: "#FAFAFA"
  surface: "#FFFFFF"
  text: "#171717"
rounded:
  control: "12px"
  panel: "16px"
---
# Design System: Rent2Go

## Overview

Preserve the existing develop interface's recognizable forest-green and mint identity, light workspace surfaces, rounded forms, and header/sidebar navigation. This is an extension of the incumbent system, not a rebrand. Operational screens prioritize the next required action and readable information.

## Colors

Forest is used for primary actions and selected navigation; mint supports contrast on dark surfaces. Soft mint groups related information. White and near-white form the light workspace. Mint is not body text on white; use darker forest for readable interactive text. Error/status colors must include text labels.

## Typography

The source uses Poppins headings, Inter body text and an Outfit wordmark. Self-host those families to avoid runtime font-network dependency. Maintain clear heading/body/label hierarchy; form labels stay visible. Avoid tiny uppercase operational copy.

## Layout

Public pages retain spacious rounded feature surfaces. Workspaces use a full-width header, left navigation at desktop widths and a compact mobile menu. Form fields group by actual application section; generous spacing separates sections. Long terms and policies use a readable text measure. Do not clip the workspace into a fixed-height screen.

## Elevation & Depth

Use fine borders for resting panels and restrained soft offset shadow for active overlays. Avoid decorative floating metrics or invented dashboard statistics.

## Shapes

Rounded controls and panels complement the incumbent. Use smaller control radii and larger public feature surfaces. Pills are reserved for compact statuses, navigation and public calls to action.

## Components

Primary buttons use forest with white text; hover uses deeper forest. Selected sidebar items use forest with white labels. Fields use white/light backgrounds and a visible focus outline. Use the same primitives for applicant and reviewer forms. Pending, disabled, error, empty and saved states are explicit. Tables retain horizontal scrolling where necessary on narrow screens.

## Do's and Don'ts

- Do preserve green/mint identity and familiar navigation.
- Do label all demo payment methods and synthetic evidence.
- Do show complete terms, price units, next steps and review reasons.
- Do keep keyboard focus visible and maintain readable contrast.
- Don't carry over unsupported controls or false claims from the old app.
- Don't add GPS/tracking navigation or fictitious metrics/reviews.
