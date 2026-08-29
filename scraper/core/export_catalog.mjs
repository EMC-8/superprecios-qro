// Bridge script: re-exports the app's own catalog (js/data.js) as plain JSON
// so the Python scraper never maintains a second, divergent copy of the
// product list, aliases or EAN codes. Run via: node export_catalog.mjs
import { PRODUCTS_CATALOG, SUPERMARKETS } from "../../js/data.js";

const supermarkets = Object.fromEntries(
  Object.entries(SUPERMARKETS).map(([key, store]) => [
    key,
    { id: store.id, name: store.name, shortName: store.shortName },
  ])
);

process.stdout.write(
  JSON.stringify({ products: PRODUCTS_CATALOG, supermarkets }, null, 2)
);
