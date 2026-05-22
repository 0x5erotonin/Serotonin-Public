import { createClient } from '@supabase/supabase-js'

// Configure these in your .env file to enable authentication.
// Without them the app runs in demo mode with no persistence.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null
