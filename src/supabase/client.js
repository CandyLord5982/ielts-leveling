import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Debug environment variables in development only
if (import.meta.env.DEV) {
  console.log('Supabase URL:', supabaseUrl ? 'Configured' : 'Missing')
  console.log('Supabase Key:', supabaseAnonKey ? 'Configured' : 'Missing')
}

// Check if environment variables are available
const hasValidConfig = supabaseUrl && supabaseAnonKey && 
  supabaseUrl !== 'https://placeholder.supabase.co' && 
  supabaseAnonKey !== 'placeholder-key'

if (!hasValidConfig) {
  console.warn('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

// Create a mock client when environment variables are missing
const createMockClient = () => ({
  auth: {
    signIn: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    signUp: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    signOut: () => Promise.resolve({ error: null }),
    onAuthStateChange: (callback) => {
      callback('SIGNED_OUT', null)
      return { data: { subscription: { unsubscribe: () => {} } } }
    },
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null })
  },
  from: () => ({
    select: () => ({ data: [], error: { message: 'Supabase not configured' } }),
    insert: () => ({ data: null, error: { message: 'Supabase not configured' } }),
    update: () => ({ data: null, error: { message: 'Supabase not configured' } }),
    delete: () => ({ data: null, error: { message: 'Supabase not configured' } })
  })
})

export const supabase = hasValidConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Only detect on login pages
        flowType: 'pkce'
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'x-application-name': 'ielts-leveling'
        }
      }
    })
  : createMockClient()
