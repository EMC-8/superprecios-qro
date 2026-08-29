# Data Model: Guided Client Checkout

## Anonymous Shopper Profile

| Field | Rules | Purpose |
|---|---|---|
| `postalCode` | Exactly five digits, optional until checkout | Retailer handoff context |
| `fulfillment` | `delivery` or `pickup` | Shopper preference |
| `updatedAt` | ISO timestamp | Future migration and support context |

## Shopping Plan

The existing plan contains local cart items, strategy, and retailer assignments computed at render
time. Cart share links contain only products and quantities. They MUST NOT contain profile fields.

## Future Database Boundary

When verified price observations or account sync are approved, add a server-side `price_observation`
entity (product, store, branch, observed price, source, observed time) and an opt-in `saved_plan`
entity. Do not migrate anonymous browser profiles automatically without explicit consent.
