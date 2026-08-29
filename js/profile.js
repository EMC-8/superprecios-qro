/** Stores only the non-sensitive fulfillment preference on this device. */

const PROFILE_KEY = 'superprecios_qro_profile_v1';
const FULFILLMENT_OPTIONS = new Set(['delivery', 'pickup']);

export function loadShopperProfile() {
  try {
    const profile = normalizeProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'));
    // Remove the legacy postal code immediately; this app no longer stores location data.
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  } catch {
    return normalizeProfile({});
  }
}

export function saveShopperProfile(input) {
  const profile = normalizeProfile(input);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function clearShopperProfile() {
  localStorage.removeItem(PROFILE_KEY);
  return normalizeProfile({});
}

function normalizeProfile(value) {
  return {
    fulfillment: FULFILLMENT_OPTIONS.has(value?.fulfillment) ? value.fulfillment : 'delivery',
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : null
  };
}
