// Schlägt Aufgaben aus dem Chatverlauf eines Projekts vor (Claude-API).
// Braucht das Secret ANTHROPIC_API_KEY. SUPABASE_URL und SUPABASE_ANON_KEY
// stehen in Supabase Edge Functions automatisch als Umgebungsvariablen bereit.
//
// Schreibt bewusst NICHTS direkt in die Datenbank: die Funktion liefert nur
// Vorschläge zurück. Übernommen werden sie erst, wenn die Nutzerin/der Nutzer
// sie im Kommunikation-Tab bestätigt - der eigentliche Insert in "aufgaben"
// läuft danach ganz normal über den Browser mit der RLS des angemeldeten
// Kontos, genau wie im Aufgaben-Tab.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ fehler: 'Nicht angemeldet.' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const { projektId } = await req.json()
    if (!projektId) {
      return new Response(JSON.stringify({ fehler: 'Keine projektId übergeben.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Client mit dem JWT der aufrufenden Person -> RLS sorgt dafür, dass nur
    // Nachrichten aus Projekten gelesen werden, auf die sie Zugriff hat.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: nachrichten, error } = await supabase
      .from('projekt_nachrichten')
      .select('text, erstellt_am, profile(vollname)')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: true })
      .limit(80)

    if (error) {
      return new Response(JSON.stringify({ fehler: error.message }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!nachrichten || nachrichten.length === 0) {
      return new Response(JSON.stringify({ vorschlaege: [] }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const transkript = (nachrichten as Array<{ text: string; profile: { vollname: string } | { vollname: string }[] | null }>)
      .map((n) => {
        const autor = Array.isArray(n.profile) ? n.profile[0]?.vollname : n.profile?.vollname
        return `${autor ?? 'Unbekannt'}: ${n.text}`
      })
      .join('\n')

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ fehler: 'ANTHROPIC_API_KEY ist auf dem Server nicht konfiguriert.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const werkzeug = {
      name: 'aufgaben_vorschlagen',
      description: 'Gibt eine Liste konkreter, umsetzbarer Aufgaben zurück, die aus dem Gesprächsverlauf hervorgehen.',
      input_schema: {
        type: 'object',
        properties: {
          aufgaben: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titel: { type: 'string', description: 'Kurzer, konkreter Aufgabentitel auf Deutsch' },
                beschreibung: { type: 'string', description: 'Optionaler Kontext aus dem Gespräch' },
              },
              required: ['titel'],
            },
          },
        },
        required: ['aufgaben'],
      },
    }

    const claudeAntwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        tools: [werkzeug],
        tool_choice: { type: 'tool', name: 'aufgaben_vorschlagen' },
        messages: [
          {
            role: 'user',
            content:
              'Das ist der Chatverlauf eines Bauprojekts. Extrahiere daraus konkrete, offene Aufgaben (To-Dos), ' +
              'die jemand erledigen muss. Erfinde nichts, was nicht im Text steht. Wenn es keine konkreten ' +
              'Aufgaben gibt, gib eine leere Liste zurück.\n\n---\n' + transkript,
          },
        ],
      }),
    })

    if (!claudeAntwort.ok) {
      const fehlertext = await claudeAntwort.text()
      return new Response(JSON.stringify({ fehler: `Claude-API-Fehler: ${fehlertext}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const claudeDaten = await claudeAntwort.json()
    const werkzeugAufruf = (claudeDaten.content ?? []).find((block: { type: string }) => block.type === 'tool_use')
    const vorschlaege = werkzeugAufruf?.input?.aufgaben ?? []

    return new Response(JSON.stringify({ vorschlaege }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ fehler: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
