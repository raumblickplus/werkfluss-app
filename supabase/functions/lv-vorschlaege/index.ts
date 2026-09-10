// Schlägt Leistungsverzeichnis-Positionen für ein Gewerk vor (Claude-API),
// angelehnt an typische VOB-/StLB-Bau-Ausschreibungstexte. Braucht das Secret
// ANTHROPIC_API_KEY. SUPABASE_URL und SUPABASE_ANON_KEY stehen in Supabase
// Edge Functions automatisch als Umgebungsvariablen bereit.
//
// Wichtig: die eigentlichen StLB-Bau-Standardtexte sind ein lizenzpflichtiges
// DIN-Produkt (siehe Konzept Abschnitt 8.10/13) - diese Funktion gibt deshalb
// KEINE wortgleichen StLB-Bau-Texte zurück, sondern von Claude neu formulierte,
// an typische Ausschreibungssprache angelehnte Vorschläge. Das ist bewusst so
// im Prompt verankert.
//
// Schreibt bewusst NICHTS direkt in die Datenbank: die Funktion liefert nur
// Vorschläge zurück. Übernommen werden sie erst, wenn die Nutzerin/der Nutzer
// sie im Ausschreibung-Tab bestätigt - der eigentliche Insert in
// "lv_positionen" läuft danach ganz normal über den Browser mit der RLS des
// angemeldeten Kontos, genau wie bei den KI-Aufgaben-Vorschlägen.

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

    const { projektId, gewerkId } = await req.json()
    if (!projektId || !gewerkId) {
      return new Response(JSON.stringify({ fehler: 'projektId und gewerkId werden benötigt.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Client mit dem JWT der aufrufenden Person -> RLS sorgt dafür, dass nur
    // Projekte/Gewerke gelesen werden, auf die sie Zugriff hat.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const [{ data: projekt, error: projektFehler }, { data: gewerk, error: gewerkFehler }] = await Promise.all([
      supabase.from('projekte').select('vorhabenart, gebaeudeklasse').eq('id', projektId).single(),
      supabase.from('gewerke').select('name').eq('id', gewerkId).single(),
    ])

    if (projektFehler || gewerkFehler || !gewerk) {
      return new Response(JSON.stringify({ fehler: 'Projekt oder Gewerk nicht gefunden oder kein Zugriff.' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ fehler: 'ANTHROPIC_API_KEY ist auf dem Server nicht konfiguriert.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const kontextTeile: string[] = []
    if (projekt?.vorhabenart) kontextTeile.push(`Vorhabenart: ${projekt.vorhabenart}`)
    if (projekt?.gebaeudeklasse) kontextTeile.push(`Gebäudeklasse: ${projekt.gebaeudeklasse}`)
    const kontext = kontextTeile.length > 0 ? kontextTeile.join(', ') : 'keine weiteren Angaben'

    const werkzeug = {
      name: 'lv_positionen_vorschlagen',
      description:
        'Gibt eine Liste typischer Leistungsverzeichnis-Positionen für ein Gewerk zurück, als Startvorschlag für eine Ausschreibung.',
      input_schema: {
        type: 'object',
        properties: {
          positionen: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kurztext: { type: 'string', description: 'Kurze, prägnante Leistungsbezeichnung auf Deutsch, wie in einem LV üblich' },
                langtext: { type: 'string', description: 'Ausführlichere Leistungsbeschreibung (2-4 Sätze), inkl. üblicher Nebenleistungen' },
                einheit: { type: 'string', description: 'Übliche Abrechnungseinheit, z. B. m², m, Stk, psch' },
              },
              required: ['kurztext', 'einheit'],
            },
          },
        },
        required: ['positionen'],
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
        max_tokens: 2048,
        tools: [werkzeug],
        tool_choice: { type: 'tool', name: 'lv_positionen_vorschlagen' },
        messages: [
          {
            role: 'user',
            content:
              `Schlage 6-10 typische Leistungsverzeichnis-Positionen für das Gewerk "${gewerk.name}" in einem deutschen Bauprojekt vor ` +
              `(${kontext}). Orientiere dich an üblicher VOB/StLB-Bau-Ausschreibungssprache und -Gliederung, ` +
              'formuliere die Texte aber selbst neu (keine wortgleiche Wiedergabe von StLB-Bau-Standardtexten, da diese ' +
              'ein lizenzpflichtiges DIN-Produkt sind). Decke die üblichen Teilleistungen des Gewerks ab (z. B. Vorarbeiten, ' +
              'Hauptleistung, typische Zusatz-/Nebenleistungen). Menge/Mengenangabe lässt du bewusst weg, da diese projektspezifisch ' +
              'ist und von der Bauleitung selbst eingetragen wird - liefere nur Kurztext, Langtext und die übliche Einheit je Position.',
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
    const vorschlaege = werkzeugAufruf?.input?.positionen ?? []

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
