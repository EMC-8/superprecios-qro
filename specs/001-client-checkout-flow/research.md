# Research: Guided Client Checkout

## Decision: Keep profile state local in v1

**Rationale:** The core handoff works anonymously. A remote database would add credentials,
privacy obligations, deployment and support cost without improving the initial retailer handoff.

**Alternatives considered:** A hosted customer database was deferred until account sync, verified
price submissions, or store coverage require shared server-side data.

## Decision: Store only postal code and fulfillment preference

**Rationale:** These fields improve instructions without collecting a street address or payment
data. Retailer sites remain authoritative for eligibility.

**Alternatives considered:** Full address collection and retailer login were rejected because both
would cross the official checkout boundary.

## Decision: Keep cart-share payload profile-free

**Rationale:** A shared shopping list is useful. Sharing a postal code is unnecessary personal
context and could lead to incorrect fulfillment expectations for the recipient.

**Alternatives considered:** Share the whole local profile. Rejected for privacy and correctness.
