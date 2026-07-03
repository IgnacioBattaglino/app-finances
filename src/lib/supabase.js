import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_PUBLISHABLE_KEY en .env. La app funciona sin datos hasta configurarlas.',
  )
}

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey)
    : null
