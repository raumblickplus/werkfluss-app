import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { karteStil, pillStil } from './stil'

type AbnahmeErgebnis = 'mangelfrei' | 'mit_maengeln' | 'verweigert'

type Referenz = {
  auftragId: string
  erstelltAm: string
  projektId: string
  projektName: string
  adresse: string | null
  vorhabenart: string | null
  kundeName: string | null
  endDatumGeplant: string | null
  eigenesProjekt: boolean
  ownerFirmaName: string | null
  abnahmeErgebnis: AbnahmeErgebnis | null
}

const vorhabenartLabel: Record<string, string> = {
  neubau: 'Neubau',
  sanierung: 'Sanierung',
  anbau: 'Anbau',
}

const abnahmeLabel: Record<AbnahmeErgebnis, string> = {
  mangelfrei: 'Mängelfrei abgenommen',
  mit_maengeln: 'Mit Restmängeln abgenommen',
  verweigert: 'Abnahme verweigert',
}

const abnahmeVariante: Record<AbnahmeErgebnis, 'ok' | 'warn' | 'bad'> = {
  mangelfrei: 'ok',
  mit_maengeln: 'warn',
  verweigert: 'bad',
}

type ProjektJoin = {
  id: string
  name: string
  adresse: string | null
  vorhabenart: string | null
  kunde_name: string | null
  firma_id: string
  end_datum_geplant: string | null
}

type AuftragRow = {
  id: string
  erstellt_am: string
  projekt_id: string
  projekte: ProjektJoin | ProjektJoin[] | null
}

// Verifizierte Referenzen statt externer Sterne-Bewertungen (Konzept
// Abschnitt 8.4): statt eine Firma um eine Selbstauskunft oder eine
// Fremdbewertung zu bitten, zeigt dieses Profil automatisch alle auf der
// Plattform abgeschlossenen Aufträge der eigenen Firma - mit den echten
// Projektdaten und, falls vorhanden, dem dokumentierten Abnahme-Ergebnis.
// Nichts davon lässt sich hier manuell eintragen; es entsteht ausschließlich
// aus Auftrags- und Abnahme-Datensätzen, die im normalen Werkfluss ohnehin
// gepflegt werden.
export default function Firmenprofil() {
  const { aktivFirma } = useAuth()
  const [referenzen, setReferenzen] = useState<Referenz[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')

  useEffect(() => {
    if (!aktivFirma) return
    let abgebrochen = false

    async function laden() {
      setLadeStatus('laedt')
      const { data: auftraegeData, error } = await supabase
        .from('auftraege')
        .select('id, erstellt_am, projekt_id, projekte(id, name, adresse, vorhabenart, kunde_name, firma_id, end_datum_geplant)')
        .eq('auftragnehmer_firma_id', aktivFirma!.id)
        .eq('status', 'abgeschlossen')
        .order('erstellt_am', { ascending: false })

      if (error) { if (!abgebrochen) setLadeStatus('fehler'); return }

      const zeilen = (auftraegeData ?? []) as unknown as AuftragRow[]
      const projekte = zeilen
        .map((z) => (Array.isArray(z.projekte) ? z.projekte[0] : z.projekte))
        .filter((p): p is ProjektJoin => Boolean(p))

      const fremdeFirmaIds = Array.from(new Set(projekte.map((p) => p.firma_id).filter((id) => id !== aktivFirma!.id)))
      const projektIds = Array.from(new Set(projekte.map((p) => p.id)))

      const [{ data: firmenData }, { data: abnahmenData }] = await Promise.all([
        fremdeFirmaIds.length > 0
          ? supabase.from('firmen').select('id, name').in('id', fremdeFirmaIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        projektIds.length > 0
          ? supabase.from('abnahmen').select('projekt_id, ergebnis, datum').in('projekt_id', projektIds).order('datum', { ascending: false })
          : Promise.resolve({ data: [] as { projekt_id: string; ergebnis: AbnahmeErgebnis; datum: string }[] }),
      ])

      const firmaNameById = new Map((firmenData ?? []).map((f) => [f.id, f.name]))
      const letzteAbnahmeProProjekt = new Map<string, AbnahmeErgebnis>()
      for (const a of abnahmenData ?? []) {
        if (!letzteAbnahmeProProjekt.has(a.projekt_id)) letzteAbnahmeProProjekt.set(a.projekt_id, a.ergebnis)
      }

      const liste: Referenz[] = zeilen
        .map((z) => {
          const p = Array.isArray(z.projekte) ? z.projekte[0] : z.projekte
          if (!p) return null
          const eigenesProjekt = p.firma_id === aktivFirma!.id
          return {
            auftragId: z.id,
            erstelltAm: z.erstellt_am,
            projektId: p.id,
            projektName: p.name,
            adresse: p.adresse,
            vorhabenart: p.vorhabenart,
            kundeName: p.kunde_name,
            endDatumGeplant: p.end_datum_geplant,
            eigenesProjekt,
            ownerFirmaName: eigenesProjekt ? null : firmaNameById.get(p.firma_id) ?? null,
            abnahmeErgebnis: letzteAbnahmeProProjekt.get(p.id) ?? null,
          }
        })
        .filter((r): r is Referenz => r !== null)

      if (!abgebrochen) {
        setReferenzen(liste)
        setLadeStatus('bereit')
      }
    }

    laden()
    return () => { abgebrochen = true }
  }, [aktivFirma?.id])

  return (
    <div>
      <div style={{ ...karteStil, marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>
          {aktivFirma?.name}
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)', maxWidth: 620 }}>
          Echte Referenzen statt externer Sterne-Bewertungen: Hier erscheinen automatisch alle auf Werkfluss
          abgeschlossenen Aufträge dieser Firma – mit den tatsächlichen Projektdaten und, falls dokumentiert, dem
          Abnahme-Ergebnis. Nichts davon wird manuell eingetragen oder von Dritten bewertet, es entsteht direkt aus
          den Auftrags- und Abnahmedaten im Werkfluss.
        </p>
      </div>

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Referenzen konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && referenzen.length === 0 && (
        <div style={karteStil}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
            Noch keine Referenzen. Sobald ein Auftrag dieser Firma auf „abgeschlossen" gesetzt wird, erscheint das
            zugehörige Projekt automatisch hier.
          </p>
        </div>
      )}

      {ladeStatus === 'bereit' && referenzen.length > 0 && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink-faint)' }}>
            {referenzen.length} abgeschlossene{referenzen.length === 1 ? 'r Auftrag' : ' Aufträge'} als Referenz
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {referenzen.map((r) => (
              <div key={r.auftragId} style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{r.projektName}</span>
                  {r.abnahmeErgebnis && (
                    <span style={pillStil(abnahmeVariante[r.abnahmeErgebnis])}>{abnahmeLabel[r.abnahmeErgebnis]}</span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
                  {r.eigenesProjekt ? 'Eigenes Projekt' : `Auftrag für ${r.ownerFirmaName ?? 'andere Firma'}`}
                  {r.vorhabenart && ` · ${vorhabenartLabel[r.vorhabenart] ?? r.vorhabenart}`}
                </span>
                {r.adresse && <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{r.adresse}</span>}
                <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
                  Abgeschlossen {new Date(r.endDatumGeplant ?? r.erstelltAm).toLocaleDateString('de-DE')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
