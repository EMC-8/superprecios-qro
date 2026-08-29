/** Anonymous shopper profile storage. Kept separate so a future remote adapter can replace it. */

const PROFILE_KEY = 'superprecios_qro_profile_v1';
const FULFILLMENT_OPTIONS = new Set(['delivery', 'pickup']);

export function loadShopperProfile() {
  try {
    return normalizeProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'));
  } catch {
    return normalizeProfile({});
  }
}

export function saveShopperProfile(input) {
  const profile = normalizeProfile(input);
  if (input.postalCode && !/^\d{5}$/.test(String(input.postalCode))) {
    throw new Error('Ingresa un código postal de cinco dígitos.');
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function clearShopperProfile() {
  localStorage.removeItem(PROFILE_KEY);
  return normalizeProfile({});
}

export function isCheckoutReady(profile) {
  return /^\d{5}$/.test(profile.postalCode) && FULFILLMENT_OPTIONS.has(profile.fulfillment);
}

function normalizeProfile(value) {
  const postalCode = String(value?.postalCode || '').replace(/\D/g, '').slice(0, 5);
  return {
    postalCode,
    fulfillment: FULFILLMENT_OPTIONS.has(value?.fulfillment) ? value.fulfillment : 'delivery',
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : null
  };
}
