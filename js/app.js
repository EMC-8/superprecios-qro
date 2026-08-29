/**
 * Aplicación Principal - SuperPrecios QRO (PWA)
 */

import { SUPERMARKETS, CATEGORIES, PRODUCTS_CATALOG, SAMPLE_LISTS, PRICE_DATA_LABEL } from './data.js';
import { parseShoppingListText, parseLine } from './parser.js';
import { calculateOptimizations } from './optimizer.js';
import { initPWA, promptInstallApp } from './pwa.js';
import { buildShareUrl, copyText, formatStoreList, getOfficialProductUrl, getOfficialStoreUrl, readSharedCart } from './checkout.js';
import { clearShopperProfile, loadShopperProfile, saveShopperProfile } from './profile.js';

// --- ESTADO GLOBAL DE LA APP ---
const AppState = {
  currentTab: 'optimizer', // 'optimizer' | 'list' | 'catalog' | 'supermarket'
  strategy: 'split',       // 'split' (menor total estimado) | 'two-stores' (práctica) | 'single' (una tienda)
  shoppingList: [],
  checkedItems: {},        // { 'item-id-store-id': true }
  searchQuery: '',
  selectedCategory: 'all',
  activeStoreFilter: 'all',
  fulfillment: 'delivery',
  shopperProfile: { fulfillment: 'delivery', updatedAt: null }
};

const STORAGE_KEY = 'superprecios_qro_list_v1';
const CHECKED_KEY = 'superprecios_qro_checked_v1';

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  loadSavedState();
  const sharedCart = readSharedCart();
  if (sharedCart) {
    AppState.shoppingList = sharedCart;
    AppState.checkedItems = {};
    saveState();
  }
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
    AppState.shopperProfile = loadShopperProfile();
    AppState.fulfillment = AppState.shopperProfile.fulfillment;
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
  } else if (tabId === 'checkout') {
    renderCheckout();
  }
}

// --- RENDERIZACIÓN GLOBAL ---
function renderAll() {
  updateCartBadge();
  renderShoppingListEditor();
  renderOptimizationResults();
  renderCatalog();
  renderSupermarketMode();
  renderCheckout();
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
    strategyBadge = '🌟 Menor total estimado (compra dividida)';
  } else if (AppState.strategy === 'two-stores' && opt.twoStoresCombo) {
    activeStoreGroups = opt.twoStoresCombo.storeGroups;
    currentTotal = opt.twoStoresCombo.total;
    strategyBadge = '⚖️ Ruta práctica estimada (máximo 2 tiendas)';
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
          ${isBest ? '⭐ Menor total individual estimado' : `+ $${diffVsOptimized.toFixed(2)} vs ruta estimada`}
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
          <button class="btn-goto-store" data-open-checkout="${store.id}">Preparar compra oficial ↗</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <p class="price-disclaimer">${PRICE_DATA_LABEL}. Los precios, stock, sucursal, sustituciones y total final pueden cambiar.</p>
    <div class="savings-hero-card">
      <div class="savings-badge">${strategyBadge}</div>
      <div class="savings-main-row">
        <div class="savings-col">
          <span class="savings-label">Total estimado con esta estrategia</span>
          <h2 class="savings-total">$${currentTotal.toFixed(2)} <small>MXN estimados</small></h2>
        </div>
        <div class="savings-delta-col">
          <div class="savings-delta-pill">
            <span>↔ Diferencia estimada</span>
            <strong>$${opt.savings.maxSavingsVsWorst.toFixed(2)} MXN</strong>
            <small>(${opt.savings.savingsPercentage}% vs la referencia más alta)</small>
          </div>
        </div>
      </div>
      <div class="savings-quick-insights">
        <div class="insight-chip">
          <span>🏪 Tiendas a visitar:</span>
          <strong>${activeStoreGroups.length}</strong>
        </div>
        <div class="insight-chip">
          <span>🏆 Menor referencia individual:</span>
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
        <h3>📊 Comparador estimado de canasta</h3>
        <span class="section-subtitle">Referencia local si compraras todo en una sola tienda</span>
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

  container.querySelectorAll('[data-open-checkout]').forEach(button => {
    button.addEventListener('click', () => {
      AppState.activeStoreFilter = button.dataset.openCheckout;
      switchTab('checkout');
    });
  });
}

function getActiveStoreGroups() {
  const opt = calculateOptimizations(AppState.shoppingList);
  if (!opt) return [];
  if (AppState.strategy === 'split') return opt.multiStore.storeGroups;
  if (AppState.strategy === 'two-stores' && opt.twoStoresCombo) return opt.twoStoresCombo.storeGroups;

  const bestStore = opt.bestSingleStore;
  return [{
    store: bestStore.store,
    subtotal: bestStore.total,
    items: bestStore.items.map(item => ({
      ...item,
      unitPrice: item.prices[bestStore.store.id],
      subtotal: item.prices[bestStore.store.id] * item.quantity
    }))
  }];
}

function renderCheckout() {
  const container = document.getElementById('checkout-container');
  if (!container) return;
  if (!AppState.shoppingList.length) {
    container.innerHTML = '<div class="empty-state-card"><div class="empty-icon">🛒</div><h3>Agrega productos antes de comprar</h3><p>Prepara tu canasta y te daremos enlaces oficiales por supermercado.</p><button class="primary-btn" data-open-list>Crear lista</button></div>';
    container.querySelector('[data-open-list]').addEventListener('click', () => switchTab('list'));
    return;
  }

  let groups = getActiveStoreGroups();
  if (AppState.activeStoreFilter !== 'all') groups = groups.filter(group => group.store.id === AppState.activeStoreFilter);
  if (!groups.length) groups = getActiveStoreGroups();
  const fulfillmentLabel = AppState.fulfillment === 'pickup' ? 'Recoger en tienda' : 'Entrega a domicilio';
  container.innerHTML = `
    <div class="checkout-intro-card">
      <div><span class="checkout-eyebrow">Compra en canales oficiales</span><h2>Prepara la lista; finaliza con cada supermercado</h2><p>Esta app no crea carritos remotos. Abre la tienda oficial, busca los productos y confirma ahí existencia, sucursal, sustituciones, cobertura y costo final.</p></div>
      <div class="fulfillment-toggle" role="group" aria-label="Modalidad preferida">
        <button class="${AppState.fulfillment === 'delivery' ? 'active' : ''}" data-fulfillment="delivery">Entrega</button>
        <button class="${AppState.fulfillment === 'pickup' ? 'active' : ''}" data-fulfillment="pickup">Pickup</button>
      </div>
    </div>
    <section class="checkout-profile-card" aria-label="Privacidad y preferencias locales">
      <div class="checkout-profile-copy">
        <span class="checkout-eyebrow">Privacidad primero</span>
        <h3>Solo guardamos tu preferencia de modalidad</h3>
        <p>La canasta, el checklist y la preferencia Entrega/Pickup quedan en este navegador. No pedimos ni almacenamos contraseñas, dirección, tarjetas, CVV o datos de pago; tampoco se envían a los supermercados.</p>
      </div>
      <div class="checkout-profile-actions">
        <button class="text-btn" type="button" data-clear-profile>Eliminar preferencias locales</button>
      </div>
    </section>
    <div class="checkout-notice">${PRICE_DATA_LABEL}. La modalidad es solo una preferencia: el supermercado confirma disponibilidad, precio, sucursal, mínimo de compra, sustituciones y cualquier costo al finalizar.</div>
    <div class="checkout-grid">${groups.map(group => renderCheckoutStore(group, fulfillmentLabel)).join('')}</div>
    <div class="checkout-share-row"><button class="secondary-btn" data-copy-share>Copiar enlace de esta canasta</button><span>Comparte la misma lista sin crear una cuenta.</span></div>`;

  container.querySelectorAll('[data-fulfillment]').forEach(button => button.addEventListener('click', () => {
    AppState.fulfillment = button.dataset.fulfillment;
    AppState.shopperProfile = saveShopperProfile({ ...AppState.shopperProfile, fulfillment: AppState.fulfillment, updatedAt: new Date().toISOString() });
    renderCheckout();
  }));
  container.querySelector('[data-clear-profile]')?.addEventListener('click', () => {
    AppState.shopperProfile = clearShopperProfile();
    AppState.fulfillment = AppState.shopperProfile.fulfillment;
    renderCheckout();
  });
  container.querySelectorAll('[data-copy-list]').forEach(button => button.addEventListener('click', async () => {
    const group = groups.find(candidate => candidate.store.id === button.dataset.copyList);
    if (!group) return;
    try { await copyText(formatStoreList(group.store, group.items, AppState.fulfillment)); showToast(`Lista de ${group.store.shortName} copiada.`); }
    catch { showToast('No se pudo copiar la lista. Intenta de nuevo.'); }
  }));
  container.querySelector('[data-copy-share]').addEventListener('click', async () => {
    try { await copyText(buildShareUrl(AppState.shoppingList)); showToast('Enlace de canasta copiado.'); }
    catch { showToast('No se pudo copiar el enlace. Intenta de nuevo.'); }
  });
}

function renderCheckoutStore(group, fulfillmentLabel) {
  const { store, items } = group;
  const products = items.map(item => {
    const quantity = item.unit === 'kg' ? `${item.quantity} kg` : `${item.quantity} ${item.unit}`;
    return `<li><span>${escapeHtml(quantity)} ${escapeHtml(item.name)}</span><a href="${getOfficialProductUrl(store, item)}" target="_blank" rel="noopener noreferrer">Buscar ↗</a></li>`;
  }).join('');
  return `<article class="checkout-store-card" style="--store-color:${store.color}"><header><div><span class="store-name">${escapeHtml(store.logoText)}</span><h3>${escapeHtml(store.name)}</h3></div><strong>$${group.subtotal.toFixed(2)} est.</strong></header><p>${items.length} productos. Preferencia: ${fulfillmentLabel}. No es un carrito ni una reserva.</p><div class="checkout-actions"><a class="primary-btn official-store-link" href="${getOfficialStoreUrl(store)}" target="_blank" rel="noopener noreferrer">Abrir tienda oficial ↗</a><button class="secondary-btn" data-copy-list="${store.id}">Copiar lista</button></div><ul class="checkout-products">${products}</ul></article>`;
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
            Desde $${bestPrice[1].toFixed(2)} est. (${bestStore.shortName})
          </span>
        </div>
        <h4 class="product-title">${prod.name}</h4>
        ${prod.ean ? `
          <div class="ean-badge-row">
            <span class="ean-pill" title="Código de identificación del producto">
              🏷️ EAN: <strong>${prod.ean}</strong>
            </span>
            <a href="${prod.officialRegistryUrl}" target="_blank" rel="noopener noreferrer" class="ean-verify-link">Consultar ↗</a>
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
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

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
  msg += `💰 *Total estimado:* $${opt.multiStore.total.toFixed(2)} MXN\n`;
  msg += `↔ *Diferencia estimada:* $${opt.savings.maxSavingsVsWorst.toFixed(2)} MXN (${opt.savings.savingsPercentage}% vs referencia más alta)\n`;
  msg += `Confirma precios, disponibilidad y total final en cada supermercado.\n\n`;

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
