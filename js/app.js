import { SUPERMARKETS, CATEGORIES, PRODUCTS_CATALOG, SAMPLE_LISTS, PRICE_DATA_LABEL } from './data.js';
import { parseShoppingListText } from './parser.js';
import { calculateOptimizations, getStoreComparison } from './optimizer.js';
import { initPWA, promptInstallApp } from './pwa.js';
import { buildShareUrl, copyText, formatStoreList, getOfficialProductUrl, getOfficialStoreUrl, readSharedCart } from './checkout.js';

const LIST_KEY = 'superprecios_qro_list_v2';
const GUIDE_KEY = 'superprecios_qro_guide_v1';
const state = { tab: 'compare', query: '', category: 'all', list: [], guide: null };
const esc = value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
const quantity = item => item.unit === 'kg' ? `${item.quantity} kg` : `${item.quantity} ${item.unit}`;

document.addEventListener('DOMContentLoaded', () => {
  load(); setup(); initPWA(available => document.getElementById('btn-install-app').classList.toggle('hidden', !available)); render();
});

function load() {
  try { state.list = JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); state.guide = JSON.parse(localStorage.getItem(GUIDE_KEY) || 'null'); } catch { state.list = []; }
  const shared = readSharedCart(); if (shared) { state.list = shared; save(); }
  if (!state.list.length) state.list = parseShoppingListText(SAMPLE_LISTS[0].text);
}
function save() { localStorage.setItem(LIST_KEY, JSON.stringify(state.list)); localStorage.setItem(GUIDE_KEY, JSON.stringify(state.guide)); }
function setup() {
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { state.tab = button.dataset.tab; render(); }));
  document.getElementById('btn-install-app').addEventListener('click', promptInstallApp);
  const input = document.getElementById('product-search');
  input.addEventListener('input', () => { state.query = input.value.trim().toLowerCase(); renderFinder(); });
  document.getElementById('clear-search').addEventListener('click', () => { input.value = ''; state.query = ''; renderFinder(); input.focus(); });
  document.getElementById('quick-add').addEventListener('click', () => { const text = document.getElementById('quick-list-text').value.trim(); if (!text) return; merge(parseShoppingListText(text)); document.getElementById('quick-list-text').value = ''; state.tab = 'list'; render(); toast('Lista agregada.'); });
  document.getElementById('btn-share').addEventListener('click', shareBasket);
}
function render() {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${state.tab}`));
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  document.getElementById('cart-count-badge').textContent = state.list.length;
  renderFinder(); renderList(); renderCompare(); renderGuide();
}
function renderFinder() {
  const host = document.getElementById('finder-results'); if (!host) return;
  const query = state.query;
  const products = PRODUCTS_CATALOG.filter(p => !query || [p.name, p.ean, ...(p.aliases || [])].join(' ').toLowerCase().includes(query)).slice(0, 8);
  host.innerHTML = products.length ? products.map(p => `<button class="finder-result" data-add="${p.id}"><span><strong>${esc(p.name)}</strong><small>${p.ean ? `EAN ${p.ean} · ` : ''}${p.unit}</small></span><b>Agregar +</b></button>`).join('') : `<div class="empty-search-state">No encontramos “${esc(query)}”. Prueba marca, presentación o EAN; también puedes pegarlo como producto libre abajo.</div>`;
  host.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => { const product = PRODUCTS_CATALOG.find(p => p.id === button.dataset.add); add(product); toast(`${product.name} agregado.`); }));
}
function add(product) { const found = state.list.find(item => item.catalogId === product.id); if (found) found.quantity += 1; else state.list.push({ id: product.id, catalogId: product.id, name: product.name, category: product.category, unit: product.unit, quantity: 1, prices: product.prices, ean: product.ean || null, isCustom: false }); save(); render(); }
function merge(items) { items.forEach(item => { const found = state.list.find(existing => existing.catalogId && existing.catalogId === item.catalogId); found ? found.quantity += item.quantity : state.list.push(item); }); save(); }
function renderList() {
  const host = document.getElementById('list-items');
  host.innerHTML = state.list.length ? state.list.map((item, index) => `<article class="list-item-card"><div><strong>${esc(item.name)}</strong><small>${quantity(item)}${item.isCustom ? ' · Producto libre: sin precios verificados' : ''}</small></div><div class="item-controls"><button aria-label="Reducir ${esc(item.name)}" data-qty="${index}" data-delta="-1">−</button><output aria-label="Cantidad">${item.quantity}</output><button aria-label="Aumentar ${esc(item.name)}" data-qty="${index}" data-delta="1">+</button><button aria-label="Eliminar ${esc(item.name)}" data-remove="${index}">×</button></div></article>`).join('') : '<div class="empty-state-card">Tu canasta está vacía. Busca un producto arriba para empezar.</div>';
  host.querySelectorAll('[data-qty]').forEach(button => button.addEventListener('click', () => { const i = Number(button.dataset.qty), step = state.list[i].unit === 'kg' ? .5 : 1; state.list[i].quantity = Math.max(step, state.list[i].quantity + Number(button.dataset.delta) * step); save(); render(); }));
  host.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { state.list.splice(Number(button.dataset.remove), 1); save(); render(); }));
}
function renderCompare() {
  const host = document.getElementById('compare-results'); if (!state.list.length) { host.innerHTML = '<div class="empty-state-card">Agrega productos para comparar.</div>'; return; }
  const data = calculateOptimizations(state.list);
  const best = data.bestComparable;
  host.innerHTML = `<div class="price-disclaimer"><strong>Datos de demo estimados.</strong> ${PRICE_DATA_LABEL}. Cada tienda recibe los mismos ${data.itemsCount} renglones; un faltante nunca vale $0.</div><section class="comparison-summary"><div><span>Canasta canónica</span><h2>${data.itemsCount} productos · ${state.list.reduce((sum, i) => sum + i.quantity, 0)} unidades</h2></div><div>${best ? `<span>Menor total completo estimado</span><h2>${esc(best.store.shortName)} · $${best.total.toFixed(2)}</h2>` : '<strong>Sin total comparable: faltan referencias.</strong>'}</div></section><div class="store-cards-grid">${data.stores.map(renderStoreCard).join('')}</div>`;
  host.querySelectorAll('[data-guide-store]').forEach(button => button.addEventListener('click', () => openGuide(button.dataset.guideStore)));
}
function renderStoreCard(result) {
  const missing = result.rows.filter(row => !row.verified);
  const rows = result.rows.map(row => `<li><span>${esc(quantity(row))} ${esc(row.name)}</span><strong>${row.verified ? `$${row.subtotal.toFixed(2)} est.` : 'No verificado · Buscar en tienda oficial'}</strong></li>`).join('');
  const total = result.complete ? `$${result.total.toFixed(2)} MXN estimados` : `Total incompleto · cobertura ${result.coveredCount}/${result.itemCount}`;
  return `<article class="store-plan-card" style="border-top-color:${result.store.color}"><header><h3>${esc(result.store.logoText)}</h3><span class="official-badge">Sitio oficial</span></header><p class="coverage ${result.complete ? 'complete' : ''}">${total}</p><ul>${rows}</ul>${missing.length ? `<p class="missing-note">${missing.length} renglón${missing.length > 1 ? 'es' : ''} sin referencia: no comparable como total definitivo.</p>` : ''}<button class="primary-btn guided-cta" data-guide-store="${result.store.id}">Comprar/verificar en ${esc(result.store.shortName)} ↗</button></article>`;
}
function openGuide(storeId) { state.guide = { storeId, index: 0, done: {} }; state.tab = 'guide'; save(); render(); }
function renderGuide() {
  const host = document.getElementById('guide-container'); if (!host) return;
  if (!state.list.length) { host.innerHTML = '<div class="empty-state-card">Primero crea tu canasta.</div>'; return; }
  if (!state.guide || !SUPERMARKETS[state.guide.storeId]) { host.innerHTML = '<div class="empty-state-card"><h3>Compra guiada</h3><p>Elige una tienda desde Comparar. Conservaremos tu avance localmente.</p></div>'; return; }
  const store = SUPERMARKETS[state.guide.storeId], i = Math.min(state.guide.index, state.list.length - 1), item = state.list[i];
  const doneCount = Object.keys(state.guide.done).length, term = `${item.name} ${item.unit === 'kg' ? '' : item.unit}`.trim(), hasEan = /^\d{8,14}$/.test(item.ean || '');
  host.innerHTML = `<section class="guide-card"><span class="checkout-eyebrow">Compra guiada · sitio oficial</span><h2>${esc(store.name)}</h2><p>Las tiendas no ofrecen un carrito universal. Este flujo conserva tu lista y evita reescribirla; inicio de sesión, sucursal, disponibilidad, sustituciones, domicilio y pago ocurren solo en el dominio oficial.</p><div class="guide-progress" aria-label="Progreso"><span style="width:${Math.round(doneCount / state.list.length * 100)}%"></span></div><p><strong>${doneCount}/${state.list.length} listos</strong> · Producto ${i + 1} de ${state.list.length}</p><article class="guide-product"><h3>${esc(item.name)}</h3><p>${esc(quantity(item))}</p><label>Término recomendado<input readonly value="${esc(term)}" aria-label="Término de búsqueda recomendado"></label><div class="guide-actions"><button class="primary-btn" data-copy-term>Copiar término</button><a class="secondary-btn" href="${getOfficialProductUrl(store, item)}" target="_blank" rel="noopener noreferrer">Abrir búsqueda oficial ↗</a>${hasEan ? `<button class="secondary-btn" data-copy-ean>Copiar EAN</button>` : '<span class="hint">Sin EAN válido: usa el término legible.</span>'}</div></article><div class="guide-footer"><button class="secondary-btn" data-copy-all>Copiar lista completa</button><button class="secondary-btn" data-web-share>Compartir</button><button class="primary-btn" data-next>${state.guide.done[i] ? 'Avanzar al siguiente' : 'Marcar listo y avanzar'}</button></div><a class="official-link" href="${getOfficialStoreUrl(store)}" target="_blank" rel="noopener noreferrer">Ir al sitio oficial de ${esc(store.shortName)} ↗</a></section>`;
  host.querySelector('[data-copy-term]').addEventListener('click', () => copy(term));
  host.querySelector('[data-copy-ean]')?.addEventListener('click', () => copy(item.ean));
  host.querySelector('[data-copy-all]').addEventListener('click', () => copy(formatStoreList(store, state.list, 'delivery')));
  host.querySelector('[data-web-share]').addEventListener('click', () => navigator.share ? navigator.share({ title: 'Mi lista SuperPrecios', text: formatStoreList(store, state.list, 'delivery') }).catch(() => {}) : copy(buildShareUrl(state.list)));
  host.querySelector('[data-next]').addEventListener('click', () => { state.guide.done[i] = true; state.guide.index = Math.min(i + 1, state.list.length - 1); save(); renderGuide(); });
}
async function copy(value) { try { await copyText(value); toast('Copiado.'); } catch { toast('No se pudo copiar; selecciónalo manualmente.'); } }
async function shareBasket() { const text = `Canasta SuperPrecios QRO\n${state.list.map(item => `- ${quantity(item)} ${item.name}`).join('\n')}`; if (navigator.share) { try { await navigator.share({ title: 'Mi canasta', text, url: buildShareUrl(state.list) }); } catch {} } else copy(buildShareUrl(state.list)); }
function toast(message) { let node = document.getElementById('app-toast'); if (!node) { node = document.createElement('div'); node.id = 'app-toast'; node.className = 'app-toast'; document.body.append(node); } node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2200); }
