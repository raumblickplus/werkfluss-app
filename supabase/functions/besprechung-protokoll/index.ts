// Automatische Besprechungsprotokolle aus aufgezeichneten Videoanrufen
// (Konzept Abschnitt 16, Phase 3). Nimmt eine besprechungId entgegen, für
// die beide Gesprächsteilnehmer bereits ihre eigene Tonspur hochgeladen
// haben (siehe Kommunikation.tsx + 0023_besprechungsprotokoll.sql),
// transkribiert jede Spur separat per OpenAI Whisper, fügt beide
// Transkripte zeitlich zu einem Gesprächsverlauf zusammen und lässt Claude
// daraus ein strukturiertes Protokoll (Themen, Beschlüsse, Zusammenfassung)
// erstellen. Braucht die Secrets OPENAI_API_KEY und ANTHROPIC_API_KEY.
//
// Datensparsamkeit: nach erfolgreicher Transkription werden die Rohton-
// Aufnahmen aus dem Storage-Bucket wieder gelöscht - nur das Text-Protokoll
// bleibt im Projekt erhalten, nicht die Audiodatei selbst.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type WhisperSegment = { start: number; text: string }
type ZeitSegment = { sprecherName: string; start: number; text: string }

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

    const { besprechungId } = await req.json()
    if (!besprechungId) {
      return new Response(JSON.stringify({ fehler: 'besprechungId fehlt.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Client mit dem JWT der aufrufenden Person -> RLS sorgt dafür, dass nur
    // auf Besprechungen aus Projekten zugegriffen werden kann, auf die
    // die Person Zugriff hat.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: besprechung, error: besprechungFehler } = await supabase
      .from('besprechungen')
      .select('id, status, protokoll')
      .eq('id', besprechungId)
      .maybeSingle()

    if (besprechungFehler || !besprechung) {
      return new Response(JSON.stringify({ fehler: 'Besprechung nicht gefunden oder kein Zugriff.' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Idempotent: falls die andere Seite die Transkription schon
    // angestoßen hat (beide Seiten rufen diese Funktion nach ihrem eigenen
    // Upload auf), einfach das vorhandene Ergebnis zurückgeben statt
    // doppelt zu transkribieren.
    if (besprechung.status === 'transkribiert') {
      return new Response(JSON.stringify({ ergebnis: besprechung.protokoll }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    if (besprechung.status === 'wird_transkribiert') {
      return new Response(JSON.stringify({ status: 'wird_transkribiert' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    await supabase.from('besprechungen').update({ status: 'wird_transkribiert' }).eq('id', besprechungId)

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!openaiKey || !anthropicKey) {
      await supabase.from('besprechungen').update({ status: 'fehler' }).eq('id', besprechungId)
      return new Response(JSON.stringify({ fehler: 'OPENAI_API_KEY oder ANTHROPIC_API_KEY ist auf dem Server nicht konfiguriert.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const { data: aufnahmen } = await supabase
      .from('besprechungsaufnahmen')
      .select('id, datei_pfad, profile(vollname)')
      .eq('besprechung_id', besprechungId)

    if (!aufnahmen || aufnahmen.length === 0) {
      await supabase.from('besprechungen').update({ status: 'fehler' }).eq('id', besprechungId)
      return new Response(JSON.stringify({ fehler: 'Keine Aufnahmen zu dieser Besprechung gefunden.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const alleSegmente: ZeitSegment[] = []
    const teilnehmerNamen: string[] = []

    for (const aufnahme of aufnahmen as unknown as Array<{ datei_pfad: string; profile: { vollname: string } | { vollname: string }[] | null }>) {
      const sprecherName = Array.isArray(aufnahme.profile) ? aufnahme.profile[0]?.vollname ?? 'Unbekannt' : aufnahme.profile?.vollname ?? 'Unbekannt'
      teilnehmerNamen.push(sprecherName)

      const { data: datei, error: downloadFehler } = await supabase.storage
        .from('besprechungsaufnahmen')
        .download(aufnahme.datei_pfad)
      if (downloadFehler || !datei) continue

      // Dateiendung aus dem gespeicherten Pfad übernehmen (Kommunikation.tsx
      // lädt je nach Browser webm/mp4/ogg hoch) - Whisper leitet das Format
      // aus dem Dateinamen ab, ein falsches "audio.webm" für eine tatsächlich
      // andere Kodierung würde die Transkription silently kaputt machen.
      const dateiname = aufnahme.datei_pfad.split('/').pop() || 'audio.webm'
      const form = new FormData()
      form.append('file', datei, dateiname)
      form.append('model', 'whisper-1')
      form.append('response_format', 'verbose_json')
      form.append('language', 'de')

      const whisperAntwort = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      })
      if (!whisperAntwort.ok) continue
      const whisperDaten = await whisperAntwort.json()
      const segmente = (whisperDaten.segments ?? []) as WhisperSegment[]
      for (const s of segmente) {
        if (s.text?.trim()) alleSegmente.push({ sprecherName, start: s.start, text: s.text.trim() })
      }
    }

    // Zeitlich zusammenfügen - beide Aufnahmen starten ungefähr gleichzeitig
    // (Aufnahmestart erfolgt bei beiden Seiten direkt nach der Zustimmung),
    // eine sekundengenaue Synchronisation ist für ein Protokoll nicht nötig.
    alleSegmente.sort((a, b) => a.start - b.start)

    if (alleSegmente.length === 0) {
      await supabase.from('besprechungen').update({ status: 'fehler' }).eq('id', besprechungId)
      return new Response(JSON.stringify({ fehler: 'Es konnte kein Gesprächsinhalt erkannt werden.' }), {
        status: 422,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const verlaufText = alleSegmente
      .map((s) => `${s.sprecherName}: ${s.text}`)
      .join('\n')

    const werkzeug = {
      name: 'protokoll_erstellen',
      description: 'Gibt ein strukturiertes Besprechungsprotokoll aus einem Gesprächsverlauf zurück.',
      input_schema: {
        type: 'object',
        properties: {
          zusammenfassung: { type: 'string', description: 'Zwei bis drei Sätze Gesamtzusammenfassung auf Deutsch' },
          themen: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titel: { type: 'string' },
                notiz: { type: 'string', description: 'Kurze Erläuterung, optional' },
              },
              required: ['titel'],
            },
          },
          beschluesse: {
            type: 'array',
            description: 'Konkrete Beschlüsse/nächste Schritte, geeignet als Aufgaben-Titel',
            items: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        },
        required: ['zusammenfassung', 'themen', 'beschluesse'],
      },
    }

    const prompt =
      'Das ist der automatisch transkribierte Gesprächsverlauf einer Video-Baubesprechung auf einer Baustelle. ' +
      'Die Sprecher-Zuordnung stammt aus getrennten Audiospuren und kann an einzelnen Stellen ungenau sein, ' +
      'die Reihenfolge der Aussagen ist in etwa chronologisch. Erstelle daraus ein knappes, sachliches ' +
      'Besprechungsprotokoll auf Deutsch: eine kurze Zusammenfassung, die wichtigsten besprochenen Themen, und ' +
      'konkrete Beschlüsse/nächste Schritte (nur was im Gespräch tatsächlich als Entscheidung oder Zusage genannt ' +
      'wurde, nichts hinzuerfinden). Wenn keine klaren Beschlüsse erkennbar sind, gib eine leere Liste zurück.\n\n' +
      `Gesprächsverlauf:\n${verlaufText}`

    const claudeAntwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1536,
        tools: [werkzeug],
        tool_choice: { type: 'tool', name: 'protokoll_erstellen' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeAntwort.ok) {
      const fehlertext = await claudeAntwort.text()
      await supabase.from('besprechungen').update({ status: 'fehler' }).eq('id', besprechungId)
      return new Response(JSON.stringify({ fehler: `Claude-API-Fehler: ${fehlertext}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const claudeDaten = await claudeAntwort.json()
    const werkzeugAufruf = (claudeDaten.content ?? []).find((block: { type: string }) => block.type === 'tool_use')
    const protokollRoh = werkzeugAufruf?.input ?? { zusammenfassung: '', themen: [], beschluesse: [] }
    const ergebnis = {
      ...protokollRoh,
      teilnehmer: Array.from(new Set(teilnehmerNamen)),
    }

    await supabase.from('besprechungen').update({
      status: 'transkribiert',
      protokoll: ergebnis,
      beendet_am: new Date().toISOString(),
    }).eq('id', besprechungId)

    // Datensparsamkeit: Rohaufnahmen nach erfolgreicher Transkription löschen.
    const pfade = (aufnahmen as unknown as Array<{ datei_pfad: string }>).map((a) => a.datei_pfad)
    if (pfade.length > 0) {
      await supabase.storage.from('besprechungsaufnahmen').remove(pfade)
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
