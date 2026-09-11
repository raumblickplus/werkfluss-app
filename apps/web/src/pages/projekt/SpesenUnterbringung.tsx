import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, karteStil } from '../stil'

type FirmaMini = { id: string; name: string } | null
type Eintrag = {
  id: string
  firma_id: string
  bezeichnung: string
  zimmer_nr: string | null
  reservierungsnummer: string | null
  von_datum: string | null
  bis_datum: string | null
  notiz: string | null
  firmen: FirmaMini
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatZeitraum(von: string | null, bis: string | null) {
  if (von && bis) return `${formatDatum(von)} – ${formatDatum(bis)}`
  if (von) return `ab ${formatDatum(von)}`
  if (bis) return `bis ${formatDatum(bis)}`
  return null
}

// Spesen & Unterbringung (Julian-Backlog 10.09.2026, Abschnitt 8.1/8.8):
// Hotel/Zimmer/Reservierung für einen Einsatz manuell erfassbar - bewusst
// ohne Hotel-Buchungsintegration ("dafür gibt's keinen einzelnen relevanten
// Anbieter"), reines Formularfeld. Jede Firma erfasst ihre eigenen Einträge
// - dieselbe Grundstruktur wie Stundenzettel.
export default function SpesenUnterbringung({ projektId }: { projektId: string }) {
  const { aktivFirma } = useAuth()
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [bezeichnung, setBezeichnung] = useState('')
  const [zimmerNr, setZimmerNr] = useState('')
  const [reservierungsnummer, setReservierungsnummer] = useState('')
  const [vonDatum, setVonDatum] = useState('')
  const [bisDatum, setBisDatum] = useState('')
  const [notiz, setNotiz] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('spesen_unterbringung')
      .select('id, firma_id, bezeichnung, zimmer_nr, reservierungsnummer, von_datum, bis_datum, notiz, firmen(id, name)')
      .eq('projekt_id', projektId)
      .order('von_datum', { ascending: false, nullsFirst: false })
    if (error) { setLadeStatus('fehler'); return }
    setEintraege((data ?? []) as unknown as Eintrag[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma) return
    if (!bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben (z. B. Hotelname).'); return }
    setSpeichert(true)
    setFehler(null)
    const { error } = await supabase.from('spesen_unterbringung').insert({
      projekt_id: projektId,
      firma_id: aktivFirma.id,
      bezeichnung: bezeichnung.trim(),
      zimmer_nr: zimmerNr.trim() || null,
      reservierungsnummer: reservierungsnummer.trim() || null,
      von_datum: vonDatum || null,
      bis_datum: bisDatum || null,
      notiz: notiz.trim() || null,
    })
    setSpeichert(false)
    if (error) { setFehler('Konnte nicht gespeichert werden.'); return }
    setBezeichnung(''); setZimmerNr(''); setReservierungsnummer(''); setVonDatum(''); setBisDatum(''); setNotiz('')
    setZeigeFormular(false)
    laden()
  }

  async function loeschen(id: string) {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return
    setEintraege((prev) => prev.filter((e) => e.id !== id))
    await supabase.from('spesen_unterbringung').delete().eq('id', id)
  }

  // Gruppiert nach Firma - der Eigentümer sieht ggf. mehrere beteiligte
  // Firmen, jede Firma sieht laut RLS ohnehin nur ihre eigenen Einträge.
  const sektionen = useMemo(() => {
    const gruppen = new Map<string, { firmenName: string; eintraege: Eintrag[] }>()
    for (const e of eintraege) {
      const key = e.firma_id
      if (!gruppen.has(key)) gruppen.set(key, { firmenName: e.firmen?.name ?? 'Unbekannte Firma', eintraege: [] })
      gruppen.get(key)!.eintraege.push(e)
    }
    return [...gruppen.values()]
  }, [eintraege])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Unterbringung erfassen'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Bezeichnung (z. B. Hotelname)
            <input style={eingabeStil} value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Hotel Adler, Musterstadt" required />
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 140px' }}>
              Zimmernummer (optional)
              <input style={eingabeStil} value={zimmerNr} onChange={(e) => setZimmerNr(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 180px' }}>
              Reservierungsnummer (optional)
              <input style={eingabeStil} value={reservierungsnummer} onChange={(e) => setReservierungsnummer(e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 140px' }}>
              Von (optional)
              <input type="date" style={eingabeStil} value={vonDatum} onChange={(e) => setVonDatum(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 140px' }}>
              Bis (optional)
              <input type="date" style={eingabeStil} value={bisDatum} onChange={(e) => setBisDatum(e.target.value)} />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Notiz (optional – z. B. wer untergebracht ist)
            <input style={eingabeStil} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. für Max und Jan, Anreise Montag früh" />
          </label>
          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
          <button type="submit" style={knopfStil} disabled={speichert || !bezeichnung.trim()}>
            {speichert ? 'Speichert …' : 'Speichern'}
          </button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Einträge konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && eintraege.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Spesen-/Unterbringungseinträge für dieses Projekt.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {sektionen.map((sektion) => (
          <div key={sektion.firmenName}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              {sektion.firmenName}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sektion.eintraege.map((e) => {
                const zeitraum = formatZeitraum(e.von_datum, e.bis_datum)
                return (
                  <div key={e.id} style={{ ...karteStil, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 140 }}>{e.bezeichnung}</span>
                    {e.zimmer_nr && <span style={{ fontSize: 11.5, color: 'var(--ink-dim)' }}>Zimmer {e.zimmer_nr}</span>}
                    {e.reservierungsnummer && <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>Res.-Nr. {e.reservierungsnummer}</span>}
                    {zeitraum && <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>{zeitraum}</span>}
                    {e.notiz && <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, color: 'var(--ink-dim)' }}>{e.notiz}</span>}
                    {e.firma_id === aktivFirma?.id && (
                      <button
                        onClick={() => loeschen(e.id)}
                        title="Entfernen"
                        style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--ink-faint)', padding: '0 4px' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="footnote">
        Jede Firma erfasst ihre eigenen Unterbringungsdaten und sieht nur ihre eigenen Einträge – der
        Projekteigentümer sieht zusätzlich die Einträge aller beteiligten Firmen. Bewusst ohne
        Hotel-Buchungsintegration – reines Formularfeld für Hotel, Zimmer und Reservierungsnummer. Kein
        Bezug zu einzelnen Mitarbeiter-Logins (der im Konzept genannte eigene Monteur-Zugang ist ein
        eigener, noch nicht angegangener Ausbauschritt) – wer untergebracht ist, steht bei Bedarf als
        Freitext in der Notiz.
      </p>
    </div>
  )
}
