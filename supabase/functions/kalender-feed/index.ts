// Kalender-Abo als .ics-Feed (Konzept Abschnitt 8.8: "Kalenderanbindung ...
// Apple Kalender (CalDAV/EventKit), Google Kalender und Outlook/Exchange -
// Termine, die die App anlegt, erscheinen im ohnehin genutzten Kalender des
// Nutzers"). Ehrlich eingeordnet: eine echte Zwei-Wege-CalDAV-/EventKit-
// Anbindung braucht native Integration (siehe Roadmap, nativer Mobile-Track)
// und ist hier NICHT umgesetzt. Was alle drei Kalender (Apple/Google/
// Outlook) aber bereits heute können, ist ein "Kalender abonnieren"
// (webcal://...) per einfacher .ics-URL - schreibgeschützt, eine Richtung
// (App -> Kalender), aber ohne jede Kalender-API-Integration umsetzbar und
// sofort in allen drei Kalendern nutzbar. Das ist der pragmatische erste
// Schritt statt gar nichts zu liefern, bis eine echte Zwei-Wege-Anbindung
// ansteht.
//
// Öffentlich erreichbar (kein Supabase-JWT im Request - Kalender-Apps
// schicken beim Abonnieren keine Auth-Header), dafür durch einen langen,
// zufälligen Token in der URL geschützt (wie ein Passwort-Reset-Link).
// Nutzt deshalb den Service-Role-Key, um NACH Token-Prüfung gezielt genau
// die Aufgaben der Firmen dieses einen Nutzers zu lesen - nicht um RLS
// pauschal zu umgehen.

import { createClient } from 'jsr:@supabase/supabase-js@2'

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

function alsIcsDatum(iso: string): string {
  return iso.replace(/-/g, '')
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response('Fehlender Token.', { status: 400 })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: nutzer } = await supabaseAdmin
    .from('profile')
    .select('id')
    .eq('kalender_token', token)
    .maybeSingle()

  if (!nutzer) {
    return new Response('Ungültiger Kalender-Link.', { status: 404 })
  }

  const { data: mitgliedschaften } = await supabaseAdmin
    .from('firma_mitglieder')
    .select('firma_id')
    .eq('nutzer_id', nutzer.id)

  const firmaIds = [...new Set((mitgliedschaften ?? []).map((m) => m.firma_id))]

  let events = ''
  if (firmaIds.length > 0) {
    const { data: projekte } = await supabaseAdmin.from('projekte').select('id, name').in('firma_id', firmaIds)
    const projektIds = (projekte ?? []).map((p) => p.id)
    const projektName = new Map((projekte ?? []).map((p) => [p.id, p.name]))

    if (projektIds.length > 0) {
      const { data: aufgaben } = await supabaseAdmin
        .from('aufgaben')
        .select('id, titel, faellig_am, gewerk, projekt_id')
        .in('projekt_id', projektIds)
        .neq('status', 'erledigt')
        .not('faellig_am', 'is', null)

      const jetzt = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

      events = (aufgaben ?? [])
        .map((a) => {
          const beschreibung = [projektName.get(a.projekt_id) ?? 'Unbekanntes Projekt', a.gewerk].filter(Boolean).join(' · ')
          return [
            'BEGIN:VEVENT',
            `UID:werkfluss-aufgabe-${a.id}@werkfluss`,
            `DTSTAMP:${jetzt}`,
            `DTSTART;VALUE=DATE:${alsIcsDatum(a.faellig_am as string)}`,
            `SUMMARY:${icsEscape(a.titel)}`,
            `DESCRIPTION:${icsEscape(beschreibung)}`,
            'END:VEVENT',
          ].join('\r\n')
        })
        .join('\r\n')
    }
  }

  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'PRODID:-//Werkfluss//Aufgaben-Kalender//DE', 'X-WR-CALNAME:Werkfluss – Aufgaben', events, 'END:VCALENDAR']
    .filter((zeile) => zeile !== '')
    .join('\r\n')

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="werkfluss-aufgaben.ics"',
    },
  })
})
