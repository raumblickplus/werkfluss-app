// Unverbindliche KI-Ersteinschätzung zu einem Bautagebuch-Foto, im Kontext
// des jeweiligen Gewerks (Konzept Abschnitt 8.1 / Phase 2, Abschnitt 16).
// Braucht das Secret ANTHROPIC_API_KEY. SUPABASE_URL und SUPABASE_ANON_KEY
// stehen in Supabase Edge Functions automatisch als Umgebungsvariablen bereit.
//
// WICHTIG (Konzept Abschnitt 17, Haftungshinweis): Das Ergebnis ist
// ausdrücklich KEINE Norm-Prüfung und KEINE Zertifizierung, sondern eine
// unterstützende, unverbindliche Ersteinschätzung. Der Prompt weist das
// Modell an, keine konkreten DIN-/VOB-Nummern zu erfinden und alle
// Beobachtungen vorsichtig zu formulieren. Das Frontend zeigt zusätzlich bei
// jeder Anzeige eines Ergebnisses einen deutlichen Hinweis darauf.

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

    const { bautagebuchId, fotoUrl } = await req.json()
    if (!bautagebuchId || !fotoUrl) {
      return new Response(JSON.stringify({ fehler: 'bautagebuchId oder fotoUrl fehlt.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Client mit dem JWT der aufrufenden Person -> RLS sorgt dafür, dass nur
    // auf Bautagebuch-Einträge aus Projekten zugegriffen werden kann, auf
    // die sie Zugriff hat. Der Gewerk-Name kommt bewusst aus der DB und
    // nicht vom Client, damit er nicht manipuliert werden kann.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: eintrag, error: eintragFehler } = await supabase
      .from('bautagebuch_eintraege')
      .select('id, fotos, gewerke(name)')
      .eq('id', bautagebuchId)
      .maybeSingle()

    if (eintragFehler || !eintrag) {
      return new Response(JSON.stringify({ fehler: 'Bautagebuch-Eintrag nicht gefunden oder kein Zugriff.' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const fotos = (eintrag.fotos ?? []) as Array<{ url: string }>
    if (!fotos.some((f) => f.url === fotoUrl)) {
      return new Response(JSON.stringify({ fehler: 'Dieses Foto gehört nicht zu diesem Eintrag.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const gewerkRoh = eintrag.gewerke as { name: string } | { name: string }[] | null
    const gewerkName = Array.isArray(gewerkRoh) ? gewerkRoh[0]?.name ?? null : gewerkRoh?.name ?? null

    const bildAntwort = await fetch(fotoUrl)
    if (!bildAntwort.ok) {
      return new Response(JSON.stringify({ fehler: 'Foto konnte nicht geladen werden.' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    const mediaType = bildAntwort.headers.get('content-type') || 'image/jpeg'
    const bildBytes = new Uint8Array(await bildAntwort.arrayBuffer())
    let binaer = ''
    for (let i = 0; i < bildBytes.length; i += 32768) {
      binaer += String.fromCharCode(...bildBytes.subarray(i, i + 32768))
    }
    const bildBase64 = btoa(binaer)

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ fehler: 'ANTHROPIC_API_KEY ist auf dem Server nicht konfiguriert.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const werkzeug = {
      name: 'einschaetzung_abgeben',
      description: 'Gibt eine vorsichtige, unverbindliche Ersteinschätzung zu einem Baustellenfoto zurück.',
      input_schema: {
        type: 'object',
        properties: {
          beobachtungen: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                aussage: { type: 'string', description: 'Eine konkrete, vorsichtig formulierte Beobachtung auf Deutsch, ohne erfundene Norm-Nummern' },
                einstufung: { type: 'string', enum: ['hinweis', 'empfehlung', 'moeglicher_mangel'] },
              },
              required: ['aussage', 'einstufung'],
            },
          },
          zusammenfassung: { type: 'string', description: 'Ein bis zwei Sätze Gesamteinschätzung auf Deutsch' },
        },
        required: ['beobachtungen', 'zusammenfassung'],
      },
    }

    const prompt =
      'Du unterstützt Handwerker:innen auf einer Baustelle mit einer Ersteinschätzung zu einem Baustellenfoto. ' +
      'WICHTIG: Das ist ausdrücklich KEINE Norm-Prüfung, KEINE Zertifizierung und ersetzt keine fachliche ' +
      'Begutachtung vor Ort. Erfinde niemals konkrete DIN-, VOB- oder andere Normnummern - meinst du eine ' +
      'allgemein anerkannte Regel der Technik, beschreibe sie in eigenen Worten statt eine Norm-Nummer zu nennen, ' +
      'außer du bist dir wirklich sicher, dass sie korrekt ist. Formuliere jede Beobachtung vorsichtig und ' +
      'konjunktivisch ("könnte", "sollte geprüft werden"), nie als endgültiges Urteil. ' +
      `Das Gewerk für dieses Foto: ${gewerkName ?? 'nicht angegeben'}. ` +
      'Nenne, falls im Foto erkennbar, mögliche Auffälligkeiten, offensichtliche Ausführungsfehler oder Punkte, ' +
      'die eine fachkundige Person vor Ort noch prüfen sollte. Wenn nichts Auffälliges zu erkennen ist, sag das ' +
      'ehrlich (leere Liste bei "beobachtungen", kurze bestätigende Zusammenfassung).'

    const claudeAntwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        tools: [werkzeug],
        tool_choice: { type: 'tool', name: 'einschaetzung_abgeben' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: bildBase64 } },
              { type: 'text', text: prompt },
            ],
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
    const ergebnis = werkzeugAufruf?.input ?? { beobachtungen: [], zusammenfassung: '' }

    await supabase.from('foto_ki_einschaetzungen').insert({
      bautagebuch_id: bautagebuchId,
      foto_url: fotoUrl,
      gewerk: gewerkName,
      ergebnis,
    })

    return new Response(JSON.stringify({ ergebnis }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ fehler: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
