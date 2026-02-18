import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROCORE_BASE = 'https://estimating.procore.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate Supabase JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { endpoint, method, body, procoreAuth } = await req.json();

    let procoreUrl: string;
    let procoreHeaders: Record<string, string> = {};
    let procoreBody: string | undefined;

    if (procoreAuth?.email && procoreAuth?.password) {
      // Authentication request
      const params = new URLSearchParams({
        userName: procoreAuth.email,
        password: procoreAuth.password,
      });
      procoreUrl = `${PROCORE_BASE}/api/integration/v1/authentication/token?${params}`;
      procoreHeaders['Content-Type'] = 'application/json';
    } else if (procoreAuth?.token) {
      // Data request - forward to Procore API
      procoreUrl = `${PROCORE_BASE}${endpoint}`;
      procoreHeaders['Authorization'] = `Bearer ${procoreAuth.token}`;
      procoreHeaders['Content-Type'] = 'application/json';
      if (body) {
        procoreBody = JSON.stringify(body);
      }
    } else {
      return new Response(JSON.stringify({ error: 'Missing Procore auth' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Forward request to Procore
    const procoreResponse = await fetch(procoreUrl, {
      method: method || 'GET',
      headers: procoreHeaders,
      body: procoreBody,
    });

    const responseText = await procoreResponse.text();

    // Try to parse as JSON, fall back to text
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { raw: responseText };
    }

    return new Response(JSON.stringify({
      status: procoreResponse.status,
      data: responseBody,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
