// Self-registration is not meant to be discoverable. /register is a decoy that
// trolls anyone poking at the obvious URL; the real form lives here instead.
// Override per deployment with VITE_REGISTER_PATH once the secret leaks
// (and it will leak — it only takes one teacher sharing their screen).

const DEFAULT_REGISTER_PATH = '/dang-ky-pinta-x7k2'

const withLeadingSlash = (path) => (path.startsWith('/') ? path : `/${path}`)

export const REGISTER_PATH = withLeadingSlash(
  import.meta.env.VITE_REGISTER_PATH || DEFAULT_REGISTER_PATH
)
