# Requirements: SuperPrecios QRO

**Defined:** 2026-08-29
**Core Value:** A shopper can turn a comparison into a confident official purchase action.

## v1 Requirements

### Shopper Profile

- [ ] **PROF-01**: Shopper can save a valid five-digit Mexican postal code locally.
- [ ] **PROF-02**: Shopper can select delivery or pickup as a preference.
- [ ] **PROF-03**: Shopper can edit or remove saved local profile data.

### Handoff

- [ ] **HAND-01**: Shopper sees a clear readiness summary before retailer handoff.
- [ ] **HAND-02**: Shopper can copy a per-store list with selected fulfillment preference.
- [ ] **HAND-03**: Shopper can open only official retailer and product-search domains.
- [ ] **HAND-04**: Shopper sees that the retailer confirms availability, coverage, and charges.

### Continuity

- [ ] **CONT-01**: Valid cart and profile data survive a browser reload.
- [ ] **CONT-02**: Shared links restore a cart without exposing profile data.
- [ ] **CONT-03**: Malformed stored or shared values fail safely.

## v2 Requirements

### Verified Data

- **DATA-01**: Operators can import verified price observations by store and date.
- **DATA-02**: Shoppers can see price freshness and source provenance.
- **DATA-03**: Authenticated shoppers can synchronize saved plans across devices.

## Out of Scope

| Feature | Reason |
|---|---|
| Remote retailer cart creation | Requires retailer-approved integrations and account context |
| Payments or retailer login | Must remain on official retailer domains |
| Price scraping | Compliance and reliability must be resolved first |

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| PROF-01 to PROF-03 | Phase 1 | Pending |
| HAND-01 to HAND-04 | Phase 1 | Pending |
| CONT-01 to CONT-03 | Phase 1 | Pending |

**Coverage:** 10 v1 requirements mapped, 0 unmapped.
