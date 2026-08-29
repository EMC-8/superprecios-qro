<!--
Sync Impact Report
Version change: template → 1.0.0
Modified principles: none (initial adoption)
Added sections: Customer Trust & Data, Delivery Workflow
Removed sections: none
Follow-up TODOs: none
-->
# SuperPrecios QRO Constitution

## Core Principles

### I. Customer Truth First
The product MUST distinguish estimates from retailer-confirmed facts. It MUST not claim live
inventory, delivery availability, pickup availability, fees, or remote-cart creation unless a
verified retailer integration supplies that information. This preserves customer trust at the
moment of purchase.

### II. Local-First, Migration-Ready
Core comparison and handoff flows MUST work without accounts or a backend. Persisted customer
preferences and cart state MUST use a documented adapter boundary so a managed database can be
introduced without changing user-facing behavior.

### III. Official Checkout Boundary
Every retailer handoff MUST use the retailer's official domain, open in a new browsing context,
and explain what the customer must confirm there. Credentials, payment information, and retailer
account sessions MUST never be collected or proxied by this application.

### IV. Accessible Mobile Completion
The primary flow MUST be usable at 375px width, keyboard reachable, and have visible focus states.
The next action needed to complete a purchase MUST remain understandable without relying only on
color, icons, or hover.

### V. Verifiable Change
Every feature MUST include a documented acceptance path and proportionate automated or browser
verification. Changes that affect saved cart data or external links MUST preserve a safe fallback
for existing users.

## Customer Trust & Data

Collect only the data required to make the handoff useful, such as a postal code and fulfillment
preference. A postal code is optional until the customer chooses to continue to a retailer. Never
commit keys, retailer credentials, customer addresses, or production data. A database is justified
only for verified price submissions, store coverage, or authenticated saved lists; browser-local
state remains the default for anonymous use.

## Delivery Workflow

Feature work starts with a specification and acceptance criteria. The maintained artifacts are the
Spec Kit feature files and the GSD project plan. Before merge, validate JavaScript syntax, static
asset references, saved-state migration behavior, and the checkout handoff in a real browser.

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

This constitution supersedes feature preferences when they conflict with customer trust, privacy,
or safe retailer handoff. Amendments require a documented rationale, a semantic version update,
and review of active specifications. A major version changes a principle, a minor version adds or
materially expands one, and a patch clarifies existing guidance. Every implementation review MUST
record its constitution check in the relevant plan.

**Version**: 1.0.0 | **Ratified**: 2026-08-29 | **Last Amended**: 2026-08-29
