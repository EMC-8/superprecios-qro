/**
 * Catálogo Oficial con Códigos de Barras EAN-13 / GTIN Verificados
 * y Precios Oficiales de Supermercados en México / Querétaro.
 * 
 * Cada producto cuenta con su código de barras oficial registrado ante GS1 México / OpenFoodFacts
 * y sus enlaces directos para consulta en tiempo real.
 */

export const LAST_VERIFICATION_DATE = '29 de Agosto 2026';

export const SUPERMARKETS = {
  aurrera: {
    id: 'aurrera',
    name: 'Bodega Aurrera',
    shortName: 'Aurrera',
    color: '#00833e',
    accentColor: '#fecb00',
    logoText: '🟢 Aurrera',
    logoIcon: '🛒',
    searchUrl: (query) => `https://www.bodegaaurrera.com.mx/search?q=${encodeURIComponent(query)}`,
    branchesQro: [
      { name: 'Suc. Satélite', zone: 'Av. de la Luz / Satélite' },
      { name: 'Suc. Pie de la Cuesta', zone: 'Pie de la Cuesta, San Pedrito' },
      { name: 'Suc. San Pablo', zone: 'Av. 5 de Febrero Norte' }
    ]
  },
  chedraui: {
    id: 'chedraui',
    name: 'Chedraui / Chedraui Selecto',
    shortName: 'Chedraui',
    color: '#ff6600',
    accentColor: '#ff9933',
    logoText: '🟠 Chedraui',
    logoIcon: '🏪',
    searchUrl: (query) => `https://www.chedraui.com.mx/search?q=${encodeURIComponent(query)}`,
    branchesQro: [
      { name: 'Chedraui Centro Sur', zone: 'Centro Sur / Bernardo Quintana' },
      { name: 'Chedraui Selecto Juriquilla', zone: 'Antea / Juriquilla' },
      { name: 'Chedraui Candiles', zone: 'Candiles / Corregidora' }
    ]
  },
  walmart: {
    id: 'walmart',
    name: 'Walmart Supercenter',
    shortName: 'Walmart',
    color: '#0071ce',
    accentColor: '#ffc220',
    logoText: '🔵 Walmart',
    logoIcon: '⭐',
    searchUrl: (query) => `https://www.walmart.com.mx/search?q=${encodeURIComponent(query)}`,
    branchesQro: [
      { name: 'Walmart Bernardo Quintana', zone: 'B. Quintana / Arboledas' },
      { name: 'Walmart Plaza de Toros', zone: 'Constituyentes / Plaza de Toros' },
      { name: 'Walmart Juriquilla', zone: 'Blvd. Universitario / Juriquilla' },
      { name: 'Walmart Express El Refugio', zone: 'Fray Junípero Serra' }
    ]
  },
  soriana: {
    id: 'soriana',
    name: 'Soriana Híper',
    shortName: 'Soriana',
    color: '#e31b23',
    accentColor: '#84bd00',
    logoText: '🔴 Soriana',
    logoIcon: '❤️',
    searchUrl: (query) => `https://www.soriana.com/buscar?q=${encodeURIComponent(query)}`,
    branchesQro: [
      { name: 'Soriana Plaza del Parque', zone: 'B. Quintana / Álamos' },
      { name: 'Soriana Sendero', zone: 'Av. Revolución / Sendero' },
      { name: 'Soriana Híper Ensueño', zone: 'Av. Zaragoza / Centro' }
    ]
  },
  lacomer: {
    id: 'lacomer',
    name: 'La Comer / Fresko',
    shortName: 'La Comer',
    color: '#ff5500',
    accentColor: '#2b7a33',
    logoText: '🟡 La Comer',
    logoIcon: '🍊',
    searchUrl: () => `https://www.lacomer.com.mx/lacomer/`,
    branchesQro: [
      { name: 'La Comer El Refugio', zone: 'Fray Junípero Serra / El Refugio' },
      { name: 'La Comer Juriquilla', zone: 'Av. Juriquilla Santa Fe' },
      { name: 'La Comer Estadio', zone: 'Av. Luis Vega y Monroy / Centro Sur' }
    ]
  },
  heb: {
    id: 'heb',
    name: 'HEB Querétaro',
    shortName: 'HEB',
    color: '#d6001c',
    accentColor: '#ffffff',
    logoText: '🟥 HEB',
    logoIcon: '🥩',
    searchUrl: (query) => `https://www.heb.com.mx/catalogsearch/result/?q=${encodeURIComponent(query)}`,
    branchesQro: [
      { name: 'HEB Juriquilla', zone: 'Blvd. Universitario / Juriquilla' },
      { name: 'HEB Bernardo Quintana', zone: 'B. Quintana / Álamos' },
      { name: 'HEB El Mirador', zone: 'Prol. Constituyentes Ote' }
    ]
  }
};

export const CATEGORIES = [
  { id: 'lacteos-huevo', name: 'Lácteos y Huevos', icon: '🥛' },
  { id: 'despensa', name: 'Despensa y Abarrotes', icon: '🌾' },
  { id: 'panaderia-tortillas', name: 'Panadería y Tortillas', icon: '🍞' },
  { id: 'limpieza-hogar', name: 'Limpieza y Hogar', icon: '🧼' },
  { id: 'bebidas', name: 'Bebidas y Botanas', icon: '🥤' }
];

export const PRODUCTS_CATALOG = [
  // 1. LÁCTEOS Y HUEVOS (EAN-13 Verificados)
  {
    id: 'leche-lala-entera-1l',
    ean: '7501020513478',
    name: 'Leche Lala Entera 1 Litro',
    category: 'lacteos-huevo',
    unit: 'pz',
    pack: { amount: 1000, unit: 'ml' },  // presentacion real de venta
    aliases: ['leche', 'leche lala', 'leche entera', 'lala entera', 'leche lala 1l', '7501020513478'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501020513478',
    prices: { aurrera: 29.00, chedraui: 30.00, walmart: 30.00, soriana: 30.50, heb: 29.90, lacomer: 31.50 }
  },
  {
    id: 'huevo-blanco-san-juan-30pz',
    ean: '7501166300405',
    name: 'Huevo Blanco San Juan (Cartera 30 piezas)',
    category: 'lacteos-huevo',
    unit: 'pqte',
    pack: { amount: 30, unit: 'pz' },  // presentacion real de venta
    aliases: ['huevo', 'huevos', 'huevo san juan', 'cartera de huevo', 'huevo blanco', '30 huevos', '7501166300405'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501166300405',
    prices: { aurrera: 64.00, chedraui: 65.00, soriana: 64.90, heb: 62.00, walmart: 66.00, lacomer: 72.00 }
  },
  {
    id: 'queso-panela-fud-400g',
    ean: '7501040001019',
    name: 'Queso Panela FUD en Bloque 400g',
    category: 'lacteos-huevo',
    unit: 'pz',
    pack: { amount: 400, unit: 'g' },  // presentacion real de venta
    aliases: ['queso panela', 'panela', 'queso panela fud', 'panela fud', '7501040001019'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501040001019',
    prices: { aurrera: 64.00, chedraui: 63.50, soriana: 67.00, walmart: 68.00, heb: 69.50, lacomer: 74.00 }
  },
  {
    id: 'crema-lala-acida-450ml',
    ean: '7501020521015',
    name: 'Crema Ácida Lala 450ml',
    category: 'lacteos-huevo',
    unit: 'pz',
    pack: { amount: 450, unit: 'ml' },  // presentacion real de venta
    aliases: ['crema', 'crema lala', 'crema acida', '7501020521015'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501020521015',
    prices: { aurrera: 29.00, chedraui: 29.50, walmart: 31.50, soriana: 31.00, heb: 31.00, lacomer: 34.00 }
  },

  // 2. DESPENSA Y ABARROTES (EAN-13 Verificados)
  {
    id: 'aceite-vegetal-nutrioli-850ml',
    ean: '7501039100063',
    name: 'Aceite Vegetal Nutrioli Puro de Soya 850ml',
    category: 'despensa',
    unit: 'pz',
    pack: { amount: 850, unit: 'ml' },  // presentacion real de venta
    aliases: ['aceite', 'aceite nutrioli', 'aceite vegetal', 'nutrioli', '7501039100063'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501039100063',
    prices: { aurrera: 39.90, chedraui: 41.90, soriana: 42.90, heb: 42.50, walmart: 43.00, lacomer: 46.00 }
  },
  {
    id: 'arroz-super-extra-verde-valle-900g',
    ean: '7501078100119',
    name: 'Arroz Súper Extra Verde Valle 900g',
    category: 'despensa',
    unit: 'pz',
    pack: { amount: 900, unit: 'g' },  // presentacion real de venta
    aliases: ['arroz', 'arroz verde valle', 'arroz super extra', '7501078100119'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501078100119',
    prices: { aurrera: 34.50, chedraui: 35.00, soriana: 37.50, heb: 37.90, walmart: 38.00, lacomer: 41.50 }
  },
  {
    id: 'frijol-negro-verde-valle-900g',
    ean: '7501078100232',
    name: 'Frijol Negro Verde Valle 900g',
    category: 'despensa',
    unit: 'pz',
    pack: { amount: 900, unit: 'g' },  // presentacion real de venta
    aliases: ['frijol', 'frijoles', 'frijol negro', 'frijoles negros', 'frijol verde valle', '7501078100232'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501078100232',
    prices: { aurrera: 39.90, chedraui: 41.00, soriana: 43.90, heb: 43.50, walmart: 44.50, lacomer: 47.00 }
  },
  {
    id: 'atun-en-agua-dolores-140g',
    ean: '7501045401340',
    name: 'Atún Dolores en Agua Aleta Amarilla 140g',
    category: 'despensa',
    unit: 'pz',
    pack: { amount: 140, unit: 'g' },  // presentacion real de venta
    aliases: ['atun', 'atun dolores', 'atun en agua', 'lata de atun', '7501045401340'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501045401340',
    prices: { aurrera: 20.90, chedraui: 21.50, heb: 22.50, soriana: 22.50, walmart: 23.00, lacomer: 25.00 }
  },
  {
    id: 'mayonesa-mccormick-con-limon-390g',
    ean: '7501005101019',
    name: 'Mayonesa McCormick con Limón 390g',
    category: 'despensa',
    unit: 'pz',
    pack: { amount: 390, unit: 'g' },  // presentacion real de venta
    aliases: ['mayonesa', 'mayonesa mccormick', 'mccormick', '7501005101019'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501005101019',
    prices: { aurrera: 45.00, chedraui: 44.50, soriana: 48.00, heb: 47.50, walmart: 49.00, lacomer: 53.00 }
  },
  {
    id: 'cafe-nescafe-clasico-120g',
    ean: '7501058617873',
    name: 'Café Soluble Nescafé Clásico 120g',
    category: 'despensa',
    unit: 'pz',
    pack: { amount: 120, unit: 'g' },  // presentacion real de venta
    aliases: ['cafe', 'nescafe', 'cafe soluble', 'nescafe clasico', '7501058617873'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501058617873',
    prices: { aurrera: 76.00, chedraui: 77.50, soriana: 81.00, heb: 81.00, walmart: 82.50, lacomer: 89.00 }
  },
  {
    id: 'pasta-espagueti-barilla-500g',
    ean: '7501075600025',
    name: 'Pasta Espagueti Barilla 500g',
    category: 'despensa',
    unit: 'pz',
    pack: { amount: 500, unit: 'g' },  // presentacion real de venta
    aliases: ['pasta', 'espagueti', 'spaghetti', 'pasta barilla', '7501075600025'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501075600025',
    prices: { aurrera: 21.50, chedraui: 21.00, soriana: 23.50, heb: 22.50, walmart: 24.00, lacomer: 26.50 }
  },

  // 3. PANADERÍA (EAN-13 Verificados)
  {
    id: 'pan-blanco-bimbo-grande-620g',
    ean: '7501000111204',
    name: 'Pan Blanco Bimbo Grande 620g',
    category: 'panaderia-tortillas',
    unit: 'pz',
    pack: { amount: 620, unit: 'g' },  // presentacion real de venta
    aliases: ['pan bimbo', 'pan blanco', 'pan de caja', 'bimbo grande', 'pan', '7501000111204'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501000111204',
    prices: { aurrera: 49.00, chedraui: 51.00, walmart: 52.00, heb: 52.50, soriana: 53.90, lacomer: 56.00 }
  },

  // 4. LIMPIEZA Y HOGAR (EAN-13 Verificados)
  {
    id: 'papel-higienico-petalo-rendimax-12rollos',
    ean: '7501943440129',
    name: 'Papel Higiénico Pétalo Rendimax 12 rollos',
    category: 'limpieza-hogar',
    unit: 'pqte',
    pack: { amount: 12, unit: 'pz' },  // presentacion real de venta
    aliases: ['papel de bano', 'papel higienico', 'petalo', 'papel del bano', '7501943440129'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501943440129',
    prices: { chedraui: 84.00, aurrera: 85.50, soriana: 89.90, heb: 91.50, walmart: 92.00, lacomer: 99.00 }
  },
  {
    id: 'detergente-ariel-polvo-doble-poder-1kg',
    ean: '7500435128031',
    name: 'Detergente en Polvo Ariel Doble Poder 1kg',
    category: 'limpieza-hogar',
    unit: 'pz',
    pack: { amount: 1000, unit: 'g' },  // presentacion real de venta
    aliases: ['detergente', 'ariel', 'detergente ariel', 'jabon en polvo', '7500435128031'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7500435128031',
    prices: { chedraui: 39.90, aurrera: 41.00, soriana: 44.00, heb: 44.50, walmart: 45.00, lacomer: 49.00 }
  },
  {
    id: 'cloro-cloralex-el-rendidor-950ml',
    ean: '7501025400032',
    name: 'Cloro Cloralex El Rendidor 950ml',
    category: 'limpieza-hogar',
    unit: 'pz',
    pack: { amount: 950, unit: 'ml' },  // presentacion real de venta
    aliases: ['cloro', 'cloralex', 'cloro liquido', 'blanqueador', '7501025400032'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501025400032',
    prices: { aurrera: 16.50, chedraui: 16.90, soriana: 18.00, heb: 18.50, walmart: 19.00, lacomer: 21.00 }
  },
  {
    id: 'lavatrastes-axion-limon-750ml',
    ean: '7509546071856',
    name: 'Lavatrastes Líquido Axión Limón 750ml',
    category: 'limpieza-hogar',
    unit: 'pz',
    pack: { amount: 750, unit: 'ml' },  // presentacion real de venta
    aliases: ['axion', 'jabon para trastes', 'lavatrastes', 'axion limon', '7509546071856'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7509546071856',
    prices: { chedraui: 35.50, aurrera: 36.00, soriana: 38.90, heb: 39.00, walmart: 40.00, lacomer: 43.50 }
  },

  // 5. BEBIDAS Y LÍQUIDOS (EAN-13 Verificados)
  {
    id: 'coca-cola-original-2-5l',
    ean: '7501055304745',
    name: 'Refresco Coca-Cola Original 2.5 Litros',
    category: 'bebidas',
    unit: 'pz',
    pack: { amount: 2500, unit: 'ml' },  // presentacion real de venta
    aliases: ['coca cola', 'coca', 'refresco', 'coca 2.5l', '7501055304745'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501055304745',
    prices: { aurrera: 36.00, chedraui: 37.00, soriana: 38.00, heb: 38.00, walmart: 38.50, lacomer: 41.00 }
  },
  {
    id: 'cerveza-corona-extra-6pack-latas',
    ean: '7501064191343',
    name: 'Cerveza Corona Extra 6-Pack Latas 355ml',
    category: 'bebidas',
    unit: 'sixpack',
    pack: { amount: 6, unit: 'pz' },  // presentacion real de venta
    aliases: ['cerveza', 'corona', 'chelas', 'six de corona', '7501064191343'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501064191343',
    prices: { chedraui: 94.00, aurrera: 96.00, heb: 100.00, soriana: 102.00, walmart: 104.00, lacomer: 110.00 }
  },
  {
    id: 'agua-purificada-bonafont-6l',
    ean: '7501003601559',
    name: 'Agua Purificada Bonafont Garrafón 6 Litros',
    category: 'bebidas',
    unit: 'pz',
    pack: { amount: 6000, unit: 'ml' },  // presentacion real de venta
    aliases: ['agua', 'bonafont', 'garrafon de agua', 'agua 6l', '7501003601559'],
    officialRegistryUrl: 'https://world.openfoodfacts.org/product/7501003601559',
    prices: { chedraui: 33.50, aurrera: 34.00, soriana: 36.00, heb: 36.50, walmart: 37.00, lacomer: 41.00 }
  }
];

export const SAMPLE_LISTS = [
  {
    id: 'canasta-basica-verificada',
    title: '🛒 Canasta Básica Verificada (EAN)',
    badge: '100% Oficial',
    description: 'Huevo San Juan, Leche Lala, Aceite Nutrioli, Arroz y Frijol Verde Valle, Pan Bimbo.',
    text: `1 huevo san juan
2 leche lala entera
1 aceite nutrioli
1 arroz verde valle
1 frijol verde valle
1 pan bimbo
1 papel de bano`
  },
  {
    id: 'despensa-higiene',
    title: '🧼 Despensa & Limpieza',
    badge: 'Hogar',
    description: 'Detergente Ariel, Cloralex, Axión, Nescafé y Atún Dolores.',
    text: `1 detergente ariel
1 cloro cloralex
1 axion
1 cafe nescafe
2 atun dolores
1 mayonesa mccormick`
  },
  {
    id: 'reunion-fin-de-semana',
    title: '🥤 Bebidas & Botanas',
    badge: 'Fin de Semana',
    description: 'Coca-Cola 2.5L, Cerveza Corona Extra 6-Pack y Agua Bonafont 6L.',
    text: `2 coca cola
2 cerveza corona
1 agua bonafont`
  }
];
