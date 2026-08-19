// Supabase Edge Function for bulk user creation
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { users } = await req.json()

    const results = {
      success: [],
      failed: []
    }

    for (const user of users) {
      try {
        // Create user in Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: {
            full_name: user.full_name,
            username: user.username
          }
        })

        if (authError) throw authError

        // Create or update user profile in public.users table
        const profileData: any = {
          id: authData.user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          real_name: user.real_name || user.full_name,
          role: user.role || 'user'
        }

        if (user.avatar_url) {
          profileData.avatar_url = user.avatar_url
        }

        // Use upsert to handle both new users and existing users
        const { error: profileError } = await supabaseClient
          .from('users')
          .upsert(profileData, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (profileError) throw profileError

        // Add to cohort if specified
        if (user.cohort) {
          const { data: cohorts } = await supabaseClient
            .from('cohorts')
            .select('id')
            .eq('name', user.cohort)
            .limit(1)

          if (cohorts && cohorts.length > 0) {
            await supabaseClient
              .from('cohort_members')
              .insert({
                cohort_id: cohorts[0].id,
                student_id: authData.user.id,
                is_active: true
              })
          }
        }

        results.success.push({
          email: user.email,
          name: user.username
        })
      } catch (error) {
        console.error('Error creating user:', user.email, error)
        results.failed.push({
          email: user.email,
          error: error.message,
          rowNumber: user.rowNumber
        })
      }
    }

    return new Response(
      JSON.stringify(results),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
