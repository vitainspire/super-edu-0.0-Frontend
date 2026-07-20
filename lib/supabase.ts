import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createBrowserClient(url, key)

// Factory function used by scanner components
export function createClient() {
  return supabase
}
