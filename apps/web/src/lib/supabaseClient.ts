import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase ist noch nicht konfiguriert. Lege apps/web/.env.local an (siehe .env.example).'
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')
