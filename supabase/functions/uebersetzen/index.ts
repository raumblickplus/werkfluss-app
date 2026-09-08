// Übersetzt eine Chat-Nachricht per DeepL-API (Live-Übersetzung im Kommunikation-Tab).
// Braucht das Secret DEEPL_API_KEY (Supabase-Dashboard -> Edge Functions -> Secrets).
// Erkennt automatisch am ":fx"-Suffix, ob es sich um den kostenlosen API-Free-Key
// handelt (dann api-free.deepl.com) oder einen bezahlten Pro-Key (api.deepl.com).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { text, zielsprache } = await req.json()
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ fehler: 'Kein Text übergeben.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const deeplKey = Deno.env.get('DEEPL_API_KEY')
    if (!deeplKey) {
      return new Response(JSON.stringify({ fehler: 'DEEPL_API_KEY ist auf dem Server nicht konfiguriert.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const istFreeTier = deeplKey.endsWith(':fx')
    const basisUrl = istFreeTier ? 'https://api-free.deepl.com' : 'https://api.deepl.com'

    const antwort = await fetch(`${basisUrl}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${deeplKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        target_lang: String(zielsprache ?? 'DE').toUpperCase(),
      }),
    })

    if (!antwort.ok) {
      const fehlertext = await antwort.text()
      return new Response(JSON.stringify({ fehler: `DeepL-Fehler: ${fehlertext}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const daten = await antwort.json()
    const uebersetzterText = daten.translations?.[0]?.text ?? ''
    const erkannteSprache = daten.translations?.[0]?.detected_source_language ?? null

    return new Response(JSON.stringify({ text: uebersetzterText, erkannteSprache }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ fehler: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
