// Feature flags read from Vite env vars at build time.
// Default to enabled when the flag is unset, so the canonical site
// keeps all features without needing to touch its .env.
// Set a flag to "false" in a deployment's env to hide that feature.

const flag = (value) => value !== 'false'

export const FEATURES = {
  pets: flag(import.meta.env.VITE_PETS_ENABLED),
  inventory: flag(import.meta.env.VITE_INVENTORY_ENABLED),
  shop: flag(import.meta.env.VITE_SHOP_ENABLED),
  missions: flag(import.meta.env.VITE_MISSIONS_ENABLED),
  tournaments: flag(import.meta.env.VITE_TOURNAMENTS_ENABLED),
  classwar: flag(import.meta.env.VITE_CLASSWAR_ENABLED),
}
