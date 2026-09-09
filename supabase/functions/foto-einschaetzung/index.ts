// Unverbindliche KI-Ersteinschätzung zu einem Foto - entweder zu einem
// Bautagebuch-Eintrag (Konzept Abschnitt 8.1, DIN-Abgleich, Phase 2 der
// Roadmap) oder zu einem gemeldeten Mangel (Konzept Abschnitt 8.1/10,
// "AR-Mängeleinschätzung" - hier die web-taugliche Variante ohne AR-Kamera-
// Tracking; die echte kamerabasierte AR-Verortung ist laut Entscheidung vom
// 09.09.2026 der künftigen nativen Mobile-App vorbehalten, siehe Abschnitt
// 18 "Weiterhin offen" im Konzept). Braucht das Secret ANTHROPIC_API_KEY.
// SUPABASE_URL und SUPABASE_ANON_KEY stehen in Supabase Edge Functions
// automatisch als Umgebungsvariablen bereit.
//
// WICHTIG (Konzept Abschnitt 17, Haftungshinweis): Das Ergebnis ist in
// beiden Fällen ausdrücklich KEINE Norm-Prüfung, KEINE fachliche/statische
// Bewertung und KEINE Zertifizierung, sondern eine unterstützende,
// unverbindliche Ersteinschätzung. Die Prompts weisen das Modell an, keine
// konkreten DIN-/VOB-Nummern zu erfinden und alle Beobachtungen vorsichtig
// zu formulieren. Das Frontend zeigt zusätzlich bei jeder Anzeige eines
// Ergebnisses einen deutlichen Hinweis darauf.

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

    const { bautagebuchId, mangelId, fotoUrl } = await req.json()
    if (!fotoUrl || (!bautagebuchId && !mangelId) || (bautagebuchId && mangelId)) {
      return new Response(
        JSON.stringify({ fehler: 'Es muss entweder bautagebuchId oder mangelId angegeben werden, zusammen mit fotoUrl.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Client mit dem JWT der aufrufenden Person -> RLS sorgt dafür, dass nur
    // auf Einträge aus Projekten zugegriffen werden kann, auf die sie
    // Zugriff hat.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(JSON.stringify({ fehler: 'ANTHROPIC_API_KEY ist auf dem Server nicht konfiguriert.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    let prompt: string
    let werkzeug: { name: string; description: string; input_schema: Record<string, unknown> }
    let bautagebuchGewerkName: string | null = null

    if (bautagebuchId) {
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
      bautagebuchGewerkName = Array.isArray(gewerkRoh) ? gewerkRoh[0]?.name ?? null : gewerkRoh?.name ?? null

      werkzeug = {
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

      prompt =
        'Du unterstützt Handwerker:innen auf einer Baustelle mit einer Ersteinschätzung zu einem Baustellenfoto. ' +
        'WICHTIG: Das ist ausdrücklich KEINE Norm-Prüfung, KEINE Zertifizierung und ersetzt keine fachliche ' +
        'Begutachtung vor Ort. Erfinde niemals konkrete DIN-, VOB- oder andere Normnummern - meinst du eine ' +
        'allgemein anerkannte Regel der Technik, beschreibe sie in eigenen Worten statt eine Norm-Nummer zu nennen, ' +
        'außer du bist dir wirklich sicher, dass sie korrekt ist. Formuliere jede Beobachtung vorsichtig und ' +
        'konjunktivisch ("könnte", "sollte geprüft werden"), nie als endgültiges Urteil. ' +
        `Das Gewerk für dieses Foto: ${bautagebuchGewerkName ?? 'nicht angegeben'}. ` +
        'Nenne, falls im Foto erkennbar, mögliche Auffälligkeiten, offensichtliche Ausführungsfehler oder Punkte, ' +
        'die eine fachkundige Person vor Ort noch prüfen sollte. Wenn nichts Auffälliges zu erkennen ist, sag das ' +
        'ehrlich (leere Liste bei "beobachtungen", kurze bestätigende Zusammenfassung).'
    } else {
      const { data: mangel, error: mangelFehler } = await supabase
        .from('maengel')
        .select('id, titel, beschreibung, zustaendiges_gewerk, fotos')
        .eq('id', mangelId)
        .maybeSingle()

      if (mangelFehler || !mangel) {
        return new Response(JSON.stringify({ fehler: 'Mangel nicht gefunden oder kein Zugriff.' }), {
          status: 403,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }

      const fotos = (mangel.fotos ?? []) as Array<{ url: string }>
      if (!fotos.some((f) => f.url === fotoUrl)) {
        return new Response(JSON.stringify({ fehler: 'Dieses Foto gehört nicht zu diesem Mangel.' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }

      werkzeug = {
        name: 'mangel_einschaetzung_abgeben',
        description: 'Gibt eine vorsichtige, unverbindliche KI-Ersteinschätzung zu einem fotografierten Mangel zurück.',
        input_schema: {
          type: 'object',
          properties: {
            vermutete_art: { type: 'string', description: 'Kurze, vorsichtig formulierte Vermutung zur Schadensart, z. B. "Setzriss" oder "Feuchtigkeitsfleck" - ohne Diagnose-Anspruch' },
            einschaetzung: {
              type: 'string',
              enum: ['unkritisch', 'beobachten', 'fachkundig_pruefen_lassen'],
              description: 'Grobe Einordnung, wie dringend eine fachkundige Prüfung vor Ort erscheint',
            },
            zusammenfassung: { type: 'string', description: 'Ein bis zwei Sätze Gesamteinschätzung auf Deutsch' },
            empfehlung: { type: 'string', description: 'Ein kurzer, konkreter Vorschlag zum weiteren Vorgehen, z. B. welches Gewerk das prüfen sollte' },
          },
          required: ['vermutete_art', 'einschaetzung', 'zusammenfassung', 'empfehlung'],
        },
      }

      prompt =
        'Du unterstützt bei der Ersteinschätzung eines auf einer Baustelle gemeldeten Mangels anhand eines Fotos. ' +
        'WICHTIG: Das ist ausdrücklich KEINE fachliche oder statische Bewertung, KEINE Norm-Prüfung und ersetzt ' +
        'keine Begutachtung vor Ort durch eine fachkundige Person - insbesondere bei möglicherweise statisch ' +
        'relevanten Befunden (z. B. Risse in tragenden Bauteilen, Absacken) unbedingt auf die Notwendigkeit einer ' +
        'fachkundigen Prüfung hinweisen, statt eine Entwarnung zu geben. Erfinde niemals konkrete DIN-/VOB-Nummern. ' +
        'Formuliere jede Aussage vorsichtig und konjunktivisch ("vermutlich", "könnte"), nie als endgültige Diagnose. ' +
        `Gemeldeter Mangel - Titel: "${mangel.titel}"` +
        (mangel.beschreibung ? `, Beschreibung: "${mangel.beschreibung}"` : '') +
        (mangel.zustaendiges_gewerk ? `, bereits zugeordnetes Gewerk: ${mangel.zustaendiges_gewerk}` : '') +
        '. Schau dir das Foto an und gib eine kurze, vorsichtige Ersteinschätzung ab: was ist vermutlich zu sehen, ' +
        'wie dringend sollte das fachkundig geprüft werden, und was wäre ein sinnvoller nächster Schritt.'
    }

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
        tool_choice: { type: 'tool', name: werkzeug.name },
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
    const ergebnis = werkzeugAufruf?.input ?? {}

    if (bautagebuchId) {
      await supabase.from('foto_ki_einschaetzungen').insert({
        bautagebuch_id: bautagebuchId,
        foto_url: fotoUrl,
        gewerk: bautagebuchGewerkName,
        ergebnis,
      })
    } else {
      await supabase.from('mangel_ki_einschaetzungen').insert({
        mangel_id: mangelId,
        foto_url: fotoUrl,
        ergebnis,
      })
    }

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
