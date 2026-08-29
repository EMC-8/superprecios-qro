# Implementation Plan: Guided Client Checkout

**Branch**: `001-client-checkout-flow` | **Date**: 2026-08-29 | **Spec**: [spec.md](spec.md)

## Summary

Add a focused anonymous shopper profile to the existing PWA. The profile contains only a valid
postal code and fulfillment preference, is saved locally beside the current cart, and makes the
official-store handoff legible. A database is deliberately not introduced in this phase because no
server-side identity, price provenance, or cross-device state is required.

## Technical Context

**Language/Version**: Browser JavaScript ES modules
**Primary Dependencies**: None
**Storage**: Browser local storage through an isolated profile module
**Testing**: Syntax checks, static asset checks, and headless browser acceptance
**Target Platform**: Modern mobile and desktop browsers, static hosting
**Project Type**: Offline-capable web application
**Performance Goals**: Initial interactive shell remains lightweight and responsive on a mid-range
mobile device
**Constraints**: No retailer credentials, payment data, backend, or claim of fee or stock certainty
**Scale/Scope**: One anonymous shopper and one basket per browser profile in v1

## Constitution Check

| Gate | Result | Evidence |
|---|---|---|
| Customer truth | Pass | Retailer confirmation notice remains visible before every handoff |
| Local-first | Pass | Profile adapter uses browser storage with safe defaults |
| Official checkout boundary | Pass | Links remain retailer-domain handoffs only |
| Accessible mobile completion | Pass | Inputs and actions use labels, focus styles, and mobile layout |
| Verifiable change | Pass | Quickstart includes state, sharing, and link validation |

## Project Structure

```text
css/
  main.css                 # Existing design system plus profile and readiness styles
  responsive.css           # Mobile layout for profile and checkout actions
js/
  app.js                   # View composition and event wiring
  checkout.js              # Official handoff and cart-sharing helpers
  profile.js               # New local profile validation and persistence boundary
specs/001-client-checkout-flow/
  spec.md
  plan.md
  research.md
  data-model.md
  contracts/local-profile.md
  quickstart.md
```

**Structure Decision**: Preserve the dependency-free static app. Introduce one small profile module
instead of a backend or framework migration so later storage adapters can replace it cleanly.

## Complexity Tracking

No constitution violations or unjustified complexity.
