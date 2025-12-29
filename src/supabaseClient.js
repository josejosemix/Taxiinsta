import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tzsujqlpxiejpznixgyf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6c3VqcWxweGllanB6bml4Z3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NTg4OTYsImV4cCI6MjA4MjUzNDg5Nn0.ladoMwLsO6ipjPzZx-MyADLWZU-MfTnDjJ58CO1hWjs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)