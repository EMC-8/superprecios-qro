# Quickstart: Guided Client Checkout Validation

1. Start a static server: `python3 -m http.server 4173`.
2. Open the app, load a sample basket, and select **Comprar**.
3. Enter `76000` and select delivery. Verify the profile summary and store cards show the preference.
4. Copy a per-store list. Verify it includes the preference and retailer-confirmation wording.
5. Reload. Verify postal code, fulfillment preference, and basket persist.
6. Copy a shared cart link, open it in a clean browser context, and verify the basket restores without
   displaying the creator's postal code.
7. Inspect outbound links. They must use the retailer's official domain and open in a separate tab.
