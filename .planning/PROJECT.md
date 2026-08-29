# SuperPrecios QRO

## What This Is

SuperPrecios QRO is an anonymous, mobile-first grocery comparison PWA for shoppers in Querétaro.
It helps people create a basket, compare a local reference catalog, and finish their order on each
supermarket's official site.

## Core Value

A shopper can confidently turn a comparison into the next official purchase action without losing
their list or being misled about retailer availability.

## Requirements

### Validated

- ✓ Basket parser, optimizer, PWA shell, and official store handoff are shipped on `main`.

### Active

- [ ] Guided anonymous handoff profile with postal code and fulfillment preference.
- [ ] Persisted, share-safe shopping plan that resumes on a second visit.
- [ ] Documented migration path for verified prices and central storage.

### Out of Scope

- Retailer-cart insertion or payment collection. Retailer credentials and checkout must remain on
  the official retailer site.
- Guaranteed delivery, pickup, inventory, or fees. Those terms vary by retailer, ZIP code, and
  session.
- Live price scraping before a compliant, verified source is available.

## Context

The current app is dependency-free static ES modules with browser local storage. It has no backend
or package manager. A central database is not currently necessary for anonymous baskets; it becomes
necessary when adding authenticated lists, verified submissions, price history, or store coverage.

## Constraints

- **Privacy**: no customer address, payment, or retailer credential collection.
- **Compatibility**: remain deployable to static hosting with no required server.
- **Truthfulness**: price data remains explicitly local reference data until verified feeds exist.
- **Mobile**: the primary completion flow must work at 375px width.

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Keep anonymous local-first state | Delivers value without account or backend friction | ✓ Good |
| Use official retailer handoff | Avoids unsupported cart automation and protects credentials | ✓ Good |
| Defer external database | No authenticated or shared server-side data is required for this release | — Pending |

---
*Last updated: 2026-08-29 after guided-checkout specification*
