/**
 * Aplicación Principal - SuperPrecios QRO (PWA)
 */

import { SUPERMARKETS, CATEGORIES, PRODUCTS_CATALOG, SAMPLE_LISTS } from './data.js';
import { parseShoppingListText, parseLine } from './parser.js';
import { calculateOptimizations } from './optimizer.js';
import { initPWA, promptInstallApp } from './pwa.js';

// --- ESTADO GLOBAL DE LA APP ---
const AppState = {
  currentTab: 'optimizer', // 'optimizer' | 'list' | 'catalog' | 'supermarket'
  strategy: 'split',       // 'split' (Ahorro Máximo) | 'two-stores' (Práctica 2 tiendas) | 'single' (1 sola tienda)
  shoppingList: [],
  checkedItems: {},        // { 'item-id-store-id': true }
  searchQuery: '',
  selectedCategory: 'all',
  activeStoreFilter: 'all'
};

const STORAGE_KEY = 'superprecios_qro_list_v1';
const CHECKED_KEY = 'superprecios_qro_checked_v1';

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  loadSavedState();
  initPWA((installAvailable) => {
    const installBtn = document.getElementById('btn-install-app');
    if (installBtn) {
      installBtn.classList.toggle('hidden', !installAvailable);
    }
  });

  setupEventListeners();
  renderAll();
});

// --- PERSISTENCIA LOCALSTORAGE ---
function loadSavedState() {
  try {
    const savedList = localStorage.getItem(STORAGE_KEY);
    if (savedList) {
      AppState.shoppingList = JSON.parse(savedList);
    } else {
      // Cargar lista de muestra por defecto si está vacío
      const defaultSample = SAMPLE_LISTS[0];
      AppState.shoppingList = parseShoppingListText(defaultSample.text);
    }

    const savedChecked = localStorage.getItem(CHECKED_KEY);
    if (savedChecked) {
      AppState.checkedItems = JSON.parse(savedChecked);
    }
  } catch (e) {
    console.error('Error cargando estado local:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.shoppingList));
    localStorage.setItem(CHECKED_KEY, JSON.stringify(AppState.checkedItems));
  } catch (e) {
    console.error('Error guardando estado local:', e);
  }
}

// --- CONFIGURACIÓN DE EVENT LISTENERS ---
function setupEventListeners() {
  // Navegación por Pestañas
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // Botón de Instalación PWA
  const installBtn = document.getElementById('btn-install-app');
  if (installBtn) {
    installBtn.addEventListener('click', promptInstallApp);
  }

  // Input de Texto Rápido
  const quickTextInput = document.getElementById('quick-list-text');
  const btnProcessText = document.getElementById('btn-process-text');
  const btnClearList = document.getElementById('btn-clear-list');

  if (btnProcessText && quickTextInput) {
    btnProcessText.addEventListener('click', () => {
      const text = quickTextInput.value.trim();
      if (!text) return;
      const parsedItems = parseShoppingListText(text);
      if (parsedItems.length > 0) {
        mergeItemsIntoList(parsedItems);
        quickTextInput.value = '';
        showToast(`✅ Se agregaron ${parsedItems.length} productos a tu canasta.`);
        switchTab('optimizer');
        renderAll();
      }
    });
  }

  if (btnClearList) {
    btnClearList.addEventListener('click', () => {
      if (AppState.shoppingList.length === 0) return;
      if (confirm('¿Deseas vaciar tu lista de compras?')) {
        AppState.shoppingList = [];
        AppState.checkedItems = {};
        saveState();
        renderAll();
        showToast('🗑️ Canasta vaciada.');
      }
    });
  }

  // Selectores de Estrategia
  document.querySelectorAll('.strategy-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.strategy-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      AppState.strategy = pill.dataset.strategy;
      renderOptimizationResults();
      renderSupermarketMode();
    });
  });

  // Selector de listas de ejemplo
  renderSampleListButtons();

  // Búsqueda en catálogo
  const catalogSearch = document.getElementById('catalog-search-input');
  if (catalogSearch) {
    catalogSearch.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value.toLowerCase().trim();
      renderCatalog();
    });
  }

  // Compartir por WhatsApp
  const btnShareWhatsapp = document.getElementById('btn-share-whatsapp');
  if (btnShareWhatsapp) {
    btnShareWhatsapp.addEventListener('click', shareListToWhatsApp);
  }
}

// --- NAVEGACIÓN ENTRE TABS ---
export function switchTab(tabId) {
  AppState.currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });

  if (tabId === 'catalog') {
    renderCatalog();
  } else if (tabId === 'supermarket') {
    renderSupermarketMode();
  } else if (tabId === 'optimizer') {
    renderOptimizationResults();
  }
}

// --- RENDERIZACIÓN GLOBAL ---
function renderAll() {
  updateCartBadge();
  renderShoppingListEditor();
  renderOptimizationResults();
  renderCatalog();
  renderSupermarketMode();
}

function updateCartBadge() {
  const badge = document.getElementById('cart-count-badge');
  if (badge) {
    const totalItems = AppState.shoppingList.length;
    badge.textContent = totalItems;
    badge.classList.toggle('hidden', totalItems === 0);
  }
}

// --- LISTAS DE MUESTRA ---
function renderSampleListButtons() {
  const container = document.getElementById('sample-lists-container');
  if (!container) return;

  container.innerHTML = SAMPLE_LISTS.map(sample => `
    <button class="sample-btn" data-id="${sample.id}">
      <span class="sample-badge">${sample.badge}</span>
      <strong>${sample.title}</strong>
      <p>${sample.description}</p>
    </button>
  `).join('');

  container.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sample = SAMPLE_LISTS.find(s => s.id === btn.dataset.id);
      if (sample) {
        AppState.shoppingList = parseShoppingListText(sample.text);
        AppState.checkedItems = {};
        saveState();
        renderAll();
        showToast(`📋 Canasta cargada: ${sample.title}`);
        switchTab('optimizer');
      }
    });
  });
}

// --- EDITOR DE LISTA DE COMPRAS (TAB: LIST) ---
function renderShoppingListEditor() {
  const listContainer = document.getElementById('shopping-list-items');
  const emptyState = document.getElementById('empty-list-state');
  if (!listContainer) return;

  if (AppState.shoppingList.length === 0) {
    listContainer.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  listContainer.innerHTML = AppState.shoppingList.map((item, index) => {
    const formattedQty = item.unit === 'kg' ? `${item.quantity} kg` : `${item.quantity} ${item.unit}`;
    return `
      <div class="list-item-card" data-index="${index}">
        <div class="item-info">
          <span class="item-name">${item.name}</span>
          <span class="item-meta">Categoría: ${getCategoryName(item.category)} • Cantidad: <strong>${formattedQty}</strong></span>
        </div>
        <div class="item-controls">
          <button class="qty-btn btn-minus" data-index="${index}">-</button>
          <span class="qty-display">${item.quantity}</span>
          <button class="qty-btn btn-plus" data-index="${index}">+</button>
          <button class="btn-delete-item" data-index="${index}" title="Eliminar">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  // Eventos de controles de cantidad
  listContainer.querySelectorAll('.btn-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      AppState.shoppingList[idx].quantity += (AppState.shoppingList[idx].unit === 'kg' ? 0.5 : 1);
      saveState();
      renderAll();
    });
  });

  listContainer.querySelectorAll('.btn-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      const step = AppState.shoppingList[idx].unit === 'kg' ? 0.5 : 1;
      if (AppState.shoppingList[idx].quantity > step) {
        AppState.shoppingList[idx].quantity -= step;
      } else {
        AppState.shoppingList.splice(idx, 1);
      }
      saveState();
      renderAll();
    });
  });

  listContainer.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      AppState.shoppingList.splice(idx, 1);
      saveState();
      renderAll();
      showToast('Producto eliminado');
    });
  });
}

// --- OPTIMIZACIÓN Y COMPARACIÓN (TAB: OPTIMIZER) ---
function renderOptimizationResults() {
  const container = document.getElementById('optimization-results');
  if (!container) return;

  if (AppState.shoppingList.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <div class="empty-icon">🛒</div>
        <h3>Tu canasta está vacía</h3>
        <p>Escribe tu lista de compras o agrega productos desde el catálogo para comparar precios en Querétaro.</p>
        <button class="primary-btn" onclick="document.querySelector('[data-tab=list]').click()">✏️ Escribir mi lista</button>
      </div>
    `;
    return;
  }

  const opt = calculateOptimizations(AppState.shoppingList);
  if (!opt) return;

  // Determinar qué conjunto de tiendas mostrar según la estrategia seleccionada
  let activeStoreGroups = [];
  let currentTotal = 0;
  let strategyBadge = '';

  if (AppState.strategy === 'split') {
    activeStoreGroups = opt.multiStore.storeGroups;
    currentTotal = opt.multiStore.total;
    strategyBadge = '🌟 Máximo Ahorro (Compra Dividida)';
  } else if (AppState.strategy === 'two-stores' && opt.twoStoresCombo) {
    activeStoreGroups = opt.twoStoresCombo.storeGroups;
    currentTotal = opt.twoStoresCombo.total;
    strategyBadge = '⚖️ Ruta Práctica (Máximo 2 Tiendas)';
  } else {
    // 1 sola tienda (la mejor)
    const bestStore = opt.bestSingleStore;
    activeStoreGroups = [{
      store: bestStore.store,
      subtotal: bestStore.total,
      items: bestStore.items.map(it => ({
        ...it,
        unitPrice: it.prices[bestStore.store.id],
        subtotal: it.prices[bestStore.store.id] * it.quantity
      }))
    }];
    currentTotal = bestStore.total;
    strategyBadge = `🏪 Todo en 1 Tienda (${bestStore.store.name})`;
  }

  // Gráfico de barras comparativas
  const maxStoreTotal = Math.max(...opt.singleStoreTotals.map(s => s.total), currentTotal);

  const comparisonBarsHtml = opt.singleStoreTotals.map(s => {
    const isBest = s.store.id === opt.bestSingleStore.store.id;
    const isCurrent = (AppState.strategy === 'single' && isBest);
    const widthPct = Math.max(15, Math.round((s.total / maxStoreTotal) * 100));
    const diffVsOptimized = Math.round((s.total - opt.multiStore.total) * 100) / 100;

    return `
      <div class="store-comparison-row ${isBest ? 'is-best-single' : ''}">
        <div class="store-comparison-header">
          <span class="store-tag" style="border-color: ${s.store.color}; color: ${s.store.color}">
            ${s.store.logoText}
          </span>
          <span class="store-total-price">$${s.total.toFixed(2)} MXN</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${widthPct}%; background: ${s.store.color}"></div>
        </div>
        <div class="store-diff-label">
          ${isBest ? '⭐ Mejor opción individual' : `+ $${diffVsOptimized.toFixed(2)} vs ruta óptima`}
        </div>
      </div>
    `;
  }).join('');

  // Generar tarjetas por tienda de la estrategia actual
  const storeCardsHtml = activeStoreGroups.map(group => {
    const store = group.store;
    const branch = store.branchesQro[0] || { name: 'Querétaro', zone: 'Área metropolitana' };

    const itemsHtml = group.items.map(it => {
      const formattedQty = it.unit === 'kg' ? `${it.quantity} kg` : `${it.quantity} ${it.unit}`;
      return `
        <div class="store-item-row">
          <div class="item-detail">
            <span class="item-name">${it.name}</span>
            <span class="item-qty">${formattedQty} × $${it.unitPrice.toFixed(2)}</span>
          </div>
          <div class="item-price">
            <strong>$${it.subtotal.toFixed(2)}</strong>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="store-plan-card" style="border-top: 4px solid ${store.color}">
        <div class="store-plan-header">
          <div class="store-branding">
            <h4 style="color: ${store.color}">${store.logoText}</h4>
            <span class="branch-zone">📍 ${branch.name} (${branch.zone})</span>
          </div>
          <div class="store-subtotal-badge">
            <span class="label">Subtotal</span>
            <span class="amount" style="color: ${store.color}">$${group.subtotal.toFixed(2)}</span>
          </div>
        </div>
        <div class="store-items-list">
          ${itemsHtml}
        </div>
        <div class="store-card-footer">
          <span>${group.items.length} ${group.items.length === 1 ? 'producto' : 'productos'} recomendados aquí</span>
          <button class="btn-goto-store" onclick="window.AppState.selectStoreMode('${store.id}')">Ir a comprar ➔</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Tarjeta de Ahorro Destacada -->
    <div class="savings-hero-card">
      <div class="savings-badge">${strategyBadge}</div>
      <div class="savings-main-row">
        <div class="savings-col">
          <span class="savings-label">Total a pagar con esta estrategia</span>
          <h2 class="savings-total">$${currentTotal.toFixed(2)} <small>MXN</small></h2>
        </div>
        <div class="savings-delta-col">
          <div class="savings-delta-pill">
            <span>🎉 Ahorras hasta</span>
            <strong>$${opt.savings.maxSavingsVsWorst.toFixed(2)} MXN</strong>
            <small>(${opt.savings.savingsPercentage}% vs tienda más cara)</small>
          </div>
        </div>
      </div>
      <div class="savings-quick-insights">
        <div class="insight-chip">
          <span>🏪 Tiendas a visitar:</span>
          <strong>${activeStoreGroups.length}</strong>
        </div>
        <div class="insight-chip">
          <span>🏆 Mejor súper único:</span>
          <strong>${opt.bestSingleStore.store.shortName} ($${opt.bestSingleStore.total.toFixed(2)})</strong>
        </div>
        <div class="insight-chip">
          <span>📦 Total productos:</span>
          <strong>${opt.itemsCount}</strong>
        </div>
      </div>
    </div>

    <!-- Comparativa Visual de la Canasta Completa -->
    <div class="section-card">
      <div class="section-title-row">
        <h3>📊 Comparador de Canasta Completa en Querétaro</h3>
        <span class="section-subtitle">Costo total si compraras todo en una sola tienda</span>
      </div>
      <div class="comparison-bars-container">
        ${comparisonBarsHtml}
      </div>
    </div>

    <!-- Desglose por Supermercado -->
    <div class="section-header-row">
      <h3>🛒 Qué comprar en cada supermercado</h3>
      <span class="badge-count">${activeStoreGroups.length} tiendas</span>
    </div>
    <div class="store-cards-grid">
      ${storeCardsHtml}
    </div>
  `;
}

// --- MODO SUPERMERCADO (CHECKLIST INTERACTIVO) ---
function renderSupermarketMode() {
  const container = document.getElementById('supermarket-mode-container');
  if (!container) return;

  if (AppState.shoppingList.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <div class="empty-icon">📝</div>
        <h3>No hay lista para el súper</h3>
        <p>Agrega productos a tu canasta para usar el checklist interactivo dentro de la tienda.</p>
      </div>
    `;
    return;
  }

  const opt = calculateOptimizations(AppState.shoppingList);
  if (!opt) return;

  let activeStoreGroups = [];
  if (AppState.strategy === 'split') {
    activeStoreGroups = opt.multiStore.storeGroups;
  } else if (AppState.strategy === 'two-stores' && opt.twoStoresCombo) {
    activeStoreGroups = opt.twoStoresCombo.storeGroups;
  } else {
    activeStoreGroups = [{
      store: opt.bestSingleStore.store,
      subtotal: opt.bestSingleStore.total,
      items: opt.bestSingleStore.items.map(it => ({
        ...it,
        unitPrice: it.prices[opt.bestSingleStore.store.id],
        subtotal: it.prices[opt.bestSingleStore.store.id] * it.quantity
      }))
    }];
  }

  // Filtrar si el usuario seleccionó una tienda específica
  if (AppState.activeStoreFilter !== 'all') {
    activeStoreGroups = activeStoreGroups.filter(g => g.store.id === AppState.activeStoreFilter);
  }

  const storeFilterButtons = `
    <div class="store-filter-bar">
      <button class="store-filter-btn ${AppState.activeStoreFilter === 'all' ? 'active' : ''}" data-store="all">
        Ver Todas (${opt.itemsCount})
      </button>
      ${Object.keys(SUPERMARKETS).map(sid => {
        const hasItems = activeStoreGroups.some(g => g.store.id === sid);
        const store = SUPERMARKETS[sid];
        return `
          <button class="store-filter-btn ${AppState.activeStoreFilter === sid ? 'active' : ''}" data-store="${sid}">
            ${store.logoText}
          </button>
        `;
      }).join('')}
    </div>
  `;

  const checklistGroupsHtml = activeStoreGroups.map(group => {
    const store = group.store;
    const items = group.items;

    const itemsChecklistHtml = items.map(item => {
      const checkKey = `${item.id}-${store.id}`;
      const isChecked = !!AppState.checkedItems[checkKey];
      const formattedQty = item.unit === 'kg' ? `${item.quantity} kg` : `${item.quantity} ${item.unit}`;

      return `
        <label class="checklist-item ${isChecked ? 'is-checked' : ''}" data-check-key="${checkKey}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} class="item-checkbox" data-check-key="${checkKey}">
          <div class="item-text">
            <span class="item-title">${item.name}</span>
            <span class="item-sub">${formattedQty} • $${item.unitPrice.toFixed(2)} c/u</span>
          </div>
          <span class="item-total-val">$${item.subtotal.toFixed(2)}</span>
        </label>
      `;
    }).join('');

    const completedCount = items.filter(it => AppState.checkedItems[`${it.id}-${store.id}`]).length;
    const progressPct = Math.round((completedCount / items.length) * 100);

    return `
      <div class="checklist-store-card" style="border-left: 5px solid ${store.color}">
        <div class="checklist-store-header">
          <div>
            <h4 style="color: ${store.color}">${store.logoText}</h4>
            <small>📍 ${store.branchesQro[0]?.name} - ${store.branchesQro[0]?.zone}</small>
          </div>
          <div class="checklist-progress-badge">
            ${completedCount} / ${items.length} listos (${progressPct}%)
          </div>
        </div>
        <div class="checklist-items-container">
          ${itemsChecklistHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="checklist-intro-card">
      <div class="checklist-title">
        <h3>🛒 Modo Supermercado (Checklist en vivo)</h3>
        <p>Ve tachando los productos conforme los coloques en tu carrito físico.</p>
      </div>
      ${storeFilterButtons}
    </div>
    <div class="checklist-body">
      ${checklistGroupsHtml}
    </div>
  `;

  // Listeners de checkboxes
  container.querySelectorAll('.item-checkbox').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const key = chk.dataset.checkKey;
      if (e.target.checked) {
        AppState.checkedItems[key] = true;
      } else {
        delete AppState.checkedItems[key];
      }
      saveState();
      renderSupermarketMode();
    });
  });

  // Listeners de filtros de tienda
  container.querySelectorAll('.store-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.activeStoreFilter = btn.dataset.store;
      renderSupermarketMode();
    });
  });
}

// --- CATÁLOGO DE PRODUCTOS (TAB: CATALOG) ---
function renderCatalog() {
  const container = document.getElementById('catalog-items-grid');
  const categoryChipsContainer = document.getElementById('category-chips');
  if (!container) return;

  // Renderizar chips de categoría
  if (categoryChipsContainer) {
    categoryChipsContainer.innerHTML = `
      <button class="category-chip ${AppState.selectedCategory === 'all' ? 'active' : ''}" data-cat="all">
        🔥 Todos (${PRODUCTS_CATALOG.length})
      </button>
      ${CATEGORIES.map(cat => `
        <button class="category-chip ${AppState.selectedCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
          ${cat.icon} ${cat.name}
        </button>
      `).join('')}
    `;

    categoryChipsContainer.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        AppState.selectedCategory = chip.dataset.cat;
        renderCatalog();
      });
    });
  }

  // Filtrar productos
  let filteredProducts = PRODUCTS_CATALOG;

  if (AppState.selectedCategory !== 'all') {
    filteredProducts = filteredProducts.filter(p => p.category === AppState.selectedCategory);
  }

  if (AppState.searchQuery) {
    filteredProducts = filteredProducts.filter(p => {
      const name = p.name.toLowerCase();
      const aliases = p.aliases.join(' ').toLowerCase();
      return name.includes(AppState.searchQuery) || aliases.includes(AppState.searchQuery);
    });
  }

  if (filteredProducts.length === 0) {
    container.innerHTML = `
      <div class="empty-search-state">
        <p>No se encontraron productos para "${AppState.searchQuery}".</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredProducts.map(prod => {
    const existingInCart = AppState.shoppingList.find(it => it.catalogId === prod.id);
    const inCartQty = existingInCart ? existingInCart.quantity : 0;

    // Encontrar mejor precio
    const storePrices = Object.entries(prod.prices);
    storePrices.sort((a, b) => a[1] - b[1]);
    const bestPrice = storePrices[0];
    const bestStore = SUPERMARKETS[bestPrice[0]];

    return `
      <div class="catalog-card">
        <div class="catalog-card-header">
          <span class="cat-tag">${CATEGORIES.find(c => c.id === prod.category)?.icon || '🛒'} ${prod.unit}</span>
          <span class="best-price-badge" style="color: ${bestStore.color}">
            Desde $${bestPrice[1].toFixed(2)} (${bestStore.shortName})
          </span>
        </div>
        <h4 class="product-title">${prod.name}</h4>
        ${prod.ean ? `
          <div class="ean-badge-row">
            <span class="ean-pill" title="Código de barras oficial registrado">
              🏷️ EAN: <strong>${prod.ean}</strong>
            </span>
            <a href="${prod.officialRegistryUrl}" target="_blank" class="ean-verify-link">Verificar ↗</a>
          </div>
        ` : ''}
        
        <div class="price-mini-grid">
          ${storePrices.slice(0, 3).map(([sid, price]) => `
            <div class="mini-price-pill">
              <span class="pill-store">${SUPERMARKETS[sid].shortName}</span>
              <span class="pill-val">$${price.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>

        <div class="catalog-card-actions">
          ${inCartQty > 0 ? `
            <div class="in-cart-counter">
              <button class="btn-catalog-qty" data-id="${prod.id}" data-action="minus">-</button>
              <span>${inCartQty} en canasta</span>
              <button class="btn-catalog-qty" data-id="${prod.id}" data-action="plus">+</button>
            </div>
          ` : `
            <button class="btn-add-product" data-id="${prod.id}">
              + Agregar a la canasta
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  // Eventos de agregar / modificar
  container.querySelectorAll('.btn-add-product').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.dataset.id;
      const product = PRODUCTS_CATALOG.find(p => p.id === prodId);
      if (product) {
        addProductToList(product, 1);
        renderCatalog();
        updateCartBadge();
        renderOptimizationResults();
        showToast(`➕ ${product.name} agregado.`);
      }
    });
  });

  container.querySelectorAll('.btn-catalog-qty').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.dataset.id;
      const action = btn.dataset.action;
      const itemIndex = AppState.shoppingList.findIndex(it => it.catalogId === prodId);

      if (itemIndex >= 0) {
        if (action === 'plus') {
          AppState.shoppingList[itemIndex].quantity += (AppState.shoppingList[itemIndex].unit === 'kg' ? 0.5 : 1);
        } else {
          const step = AppState.shoppingList[itemIndex].unit === 'kg' ? 0.5 : 1;
          if (AppState.shoppingList[itemIndex].quantity > step) {
            AppState.shoppingList[itemIndex].quantity -= step;
          } else {
            AppState.shoppingList.splice(itemIndex, 1);
          }
        }
        saveState();
        renderCatalog();
        updateCartBadge();
        renderOptimizationResults();
      }
    });
  });
}

function addProductToList(prod, qty = 1) {
  const existing = AppState.shoppingList.find(it => it.catalogId === prod.id);
  if (existing) {
    existing.quantity += qty;
  } else {
    AppState.shoppingList.push({
      id: prod.id,
      catalogId: prod.id,
      name: prod.name,
      category: prod.category,
      unit: prod.unit,
      quantity: qty,
      prices: prod.prices,
      rawInput: prod.name,
      isCustom: false
    });
  }
  saveState();
}

function mergeItemsIntoList(newItems) {
  for (const newItem of newItems) {
    const existing = AppState.shoppingList.find(it => it.catalogId && it.catalogId === newItem.catalogId);
    if (existing) {
      existing.quantity += newItem.quantity;
    } else {
      AppState.shoppingList.push(newItem);
    }
  }
  saveState();
}

// --- UTILIDADES ---
function getCategoryName(catId) {
  const cat = CATEGORIES.find(c => c.id === catId);
  return cat ? cat.name : 'Varios';
}

function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

function shareListToWhatsApp() {
  if (AppState.shoppingList.length === 0) {
    alert('Tu lista de compras está vacía.');
    return;
  }

  const opt = calculateOptimizations(AppState.shoppingList);
  if (!opt) return;

  let msg = `🛒 *Mi Ruta de Supermercados en Querétaro - SuperPrecios QRO*\n\n`;
  msg += `💰 *Total Optimizado:* $${opt.multiStore.total.toFixed(2)} MXN\n`;
  msg += `🎉 *Ahorro Estimado:* $${opt.savings.maxSavingsVsWorst.toFixed(2)} MXN (${opt.savings.savingsPercentage}%)\n\n`;

  for (const group of opt.multiStore.storeGroups) {
    msg += `📍 *${group.store.name}* (Subtotal: $${group.subtotal.toFixed(2)}):\n`;
    for (const it of group.items) {
      const q = it.unit === 'kg' ? `${it.quantity} kg` : `${it.quantity} ${it.unit}`;
      msg += `  • ${it.name} (${q}) -> $${it.subtotal.toFixed(2)}\n`;
    }
    msg += `\n`;
  }

  msg += `Generado con SuperPrecios QRO 🥑`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// Exponer selector global para botones inline
window.AppState = {
  selectStoreMode: (storeId) => {
    AppState.activeStoreFilter = storeId;
    switchTab('supermarket');
  }
};
