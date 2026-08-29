# Local Profile Contract

## Read

`loadShopperProfile()` returns a normalized profile with `postalCode`, `fulfillment`, and
`updatedAt`. Invalid or missing storage returns a safe empty profile with delivery preference.

## Write

`saveShopperProfile(input)` accepts a five-digit postal code and either supported fulfillment value.
It rejects invalid values without overwriting the last valid profile.

## Privacy

The profile stays in the current browser. Cart serialization and retailer links MUST NOT include the
postal code. Removing the profile deletes only local profile data and leaves the cart unchanged.
