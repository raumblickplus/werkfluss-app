// Ordnet Leistungsverzeichnis-Positionen den Preiskatalog-Einträgen der
// eigenen Firma zu (Claude-API), als Ergänzung zur bisherigen exakten
// Textübereinstimmung in Angebote.tsx (normalisiert(kurztext) === ...).
//
// Warum das nötig ist: LV-Kurztexte kommen entweder von Hand (freie
// Formulierung) oder aus den KI-Vorschlägen (lv-vorschlaege, Abschnitt 8.10)
// - dort bewusst neu formuliert statt wortgleiche StLB-Bau-Texte. Der eigene
// Preiskatalog (Preiskatalog.tsx) ist unabhängig davon in eigenen Worten
// gepflegt. Zwei frei formulierte Texte treffen sich nach exakter
// Normalisierung praktisch nie ("Fliesenverlegung Bad" vs. "Bodenfliesen
// verlegen, Bad/WC") - die "automatische Angebotserstellung" aus der
// Konzept-Doku (Abschnitt 8.2/16 Phase 2) bliebe damit meistens leer.
//
// Schreibt bewusst NICHTS in die Datenbank: liefert nur Zuordnungsvorschläge
// (welche LV-Position passt zu welcher Preiskatalog-Position) zurück. Die
// Preise werden im Frontend aus dem bereits geladenen, RLS-gelesenen
// Preiskatalog übernommen - die Funktion selbst erfindet keine Preise.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Kandidat = { id: string; kurztext: string; einheit: string | null }

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

    const { lvPositionen, katalogPositionen } = (await req.json()) as {
      lvPositionen: Kandidat[]
      katalogPositionen: Kandidat[]
    }

    if (!Array.isArray(lvPositionen) || !Array.isArray(katalogPositionen)) {
      return new Response(JSON.stringify({ fehler: 'lvPositionen und katalogPositionen werden benötigt.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    if (lvPositionen.length === 0 || katalogPositionen.length === 0) {
      return new Response(JSON.stringify({ zuordnungen: [] }), {
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

    const lvListe = lvPositionen.map((p) => `- [${p.id}] ${p.kurztext}${p.einheit ? ` (${p.einheit})` : ''}`).join('\n')
    const katalogListe = katalogPositionen.map((p) => `- [${p.id}] ${p.kurztext}${p.einheit ? ` (${p.einheit})` : ''}`).join('\n')

    const werkzeug = {
      name: 'positionen_zuordnen',
      description:
        'Ordnet jeder Leistungsverzeichnis-Position die inhaltlich am besten passende Preiskatalog-Position derselben Firma zu, sofern eine wirklich passt.',
      input_schema: {
        type: 'object',
        properties: {
          zuordnungen: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lv_position_id: { type: 'string', description: 'ID der Leistungsverzeichnis-Position' },
                katalog_position_id: {
                  type: 'string',
                  description: 'ID der passenden Preiskatalog-Position, oder leerer String, wenn keine ausreichend gut passt',
                },
              },
              required: ['lv_position_id', 'katalog_position_id'],
            },
          },
        },
        required: ['zuordnungen'],
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
        tool_choice: { type: 'tool', name: 'positionen_zuordnen' },
        messages: [
          {
            role: 'user',
            content:
              'Hier ist ein Leistungsverzeichnis (LV) für ein Bauprojekt und der eigene Preiskatalog eines Handwerksbetriebs. ' +
              'Beide sind unabhängig voneinander formuliert, meinen aber oft dieselbe Leistung mit anderen Worten ' +
              '(z. B. "Fliesenverlegung Bad" und "Bodenfliesen verlegen, Bad/WC" sind dieselbe Leistung). ' +
              'Ordne jeder LV-Position die inhaltlich am besten passende Preiskatalog-Position zu - nur wenn es sich ' +
              'erkennbar um dieselbe oder eine sehr nah verwandte Leistung handelt. Bei Unsicherheit oder wenn keine ' +
              'Katalogposition thematisch passt, gib für katalog_position_id einen leeren String zurück statt zu raten.\n\n' +
              `Leistungsverzeichnis:\n${lvListe}\n\nPreiskatalog:\n${katalogListe}`,
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
    const zuordnungen = werkzeugAufruf?.input?.zuordnungen ?? []

    return new Response(JSON.stringify({ zuordnungen }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ fehler: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
