import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, karteStil } from '../stil'

type FirmaMini = { id: string; name: string } | null
type ProfilMini = { vollname: string } | null
type Eintrag = {
  id: string
  firma_id: string
  nutzer_id: string | null
  datum: string
  stunden: number
  taetigkeit: string | null
  firmen: FirmaMini
  profile: ProfilMini
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatStunden(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: n % 1 === 0 ? 0 : 1, maximumFractionDigits: 2 })
}

// Stundenzettel (Konzept Abschnitt 9): eines von vier Pflicht-Artefakten
// (Bautagebuch, Stundenzettel, To-do-Listen, Abnahmeprotokolle), bisher als
// einziges komplett unumgesetzt. Jede Firma erfasst ihre eigenen Stunden -
// die eintragende Firma ist immer die eigene aktive Firma, keine Auswahl.
export default function Stundenzettel({ projektId }: { projektId: string }) {
  const { aktivFirma, session } = useAuth()
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10))
  const [stunden, setStunden] = useState('')
  const [taetigkeit, setTaetigkeit] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('stundenzettel')
      .select('id, firma_id, nutzer_id, datum, stunden, taetigkeit, firmen(id, name), profile(vollname)')
      .eq('projekt_id', projektId)
      .order('datum', { ascending: false })
    if (error) { setLadeStatus('fehler'); return }
    setEintraege((data ?? []) as unknown as Eintrag[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma) return
    const stundenNum = parseFloat(stunden.replace(',', '.'))
    if (Number.isNaN(stundenNum) || stundenNum <= 0) { setFehler('Bitte eine gültige Stundenzahl angeben.'); return }
    setSpeichert(true)
    setFehler(null)
    const { error } = await supabase.from('stundenzettel').insert({
      projekt_id: projektId,
      firma_id: aktivFirma.id,
      nutzer_id: session?.user?.id ?? null,
      datum,
      stunden: stundenNum,
      taetigkeit: taetigkeit.trim() || null,
    })
    setSpeichert(false)
    if (error) { setFehler('Konnte nicht gespeichert werden.'); return }
    setDatum(new Date().toISOString().slice(0, 10)); setStunden(''); setTaetigkeit('')
    setZeigeFormular(false)
    laden()
  }

  async function loeschen(id: string) {
    if (!confirm('Diesen Stundenzettel-Eintrag wirklich löschen?')) return
    setEintraege((prev) => prev.filter((e) => e.id !== id))
    await supabase.from('stundenzettel').delete().eq('id', id)
  }

  // Gruppiert nach Firma (der Eigentümer sieht ggf. mehrere beteiligte
  // Firmen, jede Firma sieht laut RLS ohnehin nur ihre eigenen Einträge) -
  // je Firma zusätzlich die Gesamtstunden als schnelle Abrechnungsgrundlage.
  const sektionen = useMemo(() => {
    const gruppen = new Map<string, { firmenName: string; eintraege: Eintrag[] }>()
    for (const e of eintraege) {
      const key = e.firma_id
      if (!gruppen.has(key)) gruppen.set(key, { firmenName: e.firmen?.name ?? 'Unbekannte Firma', eintraege: [] })
      gruppen.get(key)!.eintraege.push(e)
    }
    return [...gruppen.values()].map((g) => ({
      ...g,
      summeStunden: g.eintraege.reduce((sum, e) => sum + e.stunden, 0),
    }))
  }, [eintraege])

  const eigeneSummeMonat = useMemo(() => {
    const heute = new Date()
    return eintraege
      .filter((e) => e.firma_id === aktivFirma?.id)
      .filter((e) => { const d = new Date(e.datum); return d.getFullYear() === heute.getFullYear() && d.getMonth() === heute.getMonth() })
      .reduce((sum, e) => sum + e.stunden, 0)
  }, [eintraege, aktivFirma?.id])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)' }}>
          Eigene Arbeitsstunden diesen Monat: <strong>{formatStunden(eigeneSummeMonat)} Std.</strong>
        </p>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Stunden erfassen'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Datum
              <input type="date" style={eingabeStil} value={datum} onChange={(e) => setDatum(e.target.value)} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 120px' }}>
              Stunden
              <input style={eingabeStil} value={stunden} onChange={(e) => setStunden(e.target.value)} placeholder="z. B. 7,5" required />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Tätigkeit (optional)
            <input style={eingabeStil} value={taetigkeit} onChange={(e) => setTaetigkeit(e.target.value)} placeholder="z. B. Trockenbau OG, Wände stellen" />
          </label>
          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
          <button type="submit" style={knopfStil} disabled={speichert || !stunden.trim()}>
            {speichert ? 'Speichert …' : 'Speichern'}
          </button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Stundenzettel konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && eintraege.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Stunden erfasst.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {sektionen.map((sektion) => (
          <div key={sektion.firmenName}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {sektion.firmenName}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }}>{formatStunden(sektion.summeStunden)} Std. gesamt</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sektion.eintraege.map((e) => (
                <div key={e.id} style={{ ...karteStil, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 84 }}>{formatDatum(e.datum)}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--olive-light)' }}>{formatStunden(e.stunden)} Std.</span>
                  {e.profile?.vollname && <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>{e.profile.vollname}</span>}
                  {e.taetigkeit && <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, color: 'var(--ink-dim)' }}>{e.taetigkeit}</span>}
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
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="footnote">
        Jede Firma erfasst ihre eigenen Stunden und sieht nur ihre eigenen Einträge – der Projekteigentümer
        sieht zusätzlich die Stunden aller beteiligten Firmen als Abrechnungsgrundlage. Eine automatische
        Zahlungsfreigabe aus Stundenzettel und Unterschrift ist bewusst nicht Teil dieser Umsetzung.
      </p>
    </div>
  )
}
