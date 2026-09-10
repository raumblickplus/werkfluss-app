import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil, pillStil } from '../stil'

type Phase = {
  id: string
  phase_nr: number
  bezeichnung: string
  honorar_prozent: number
  status: 'nicht_begonnen' | 'in_bearbeitung' | 'abgeschlossen'
  start_datum: string | null
  ende_datum: string | null
  notiz: string | null
}

// Standard-Leistungsbild "Gebäude und Innenräume" nach HOAI Paragraph 34,
// mit den dort üblichen Honorar-Prozentsätzen (Summe 100). Bewusst als
// feste, für jedes Projekt gleiche Vorbelegung - keine automatische
// Anpassung je Gebäudeklasse (z. B. WEG-Sondereigentum aus Abschnitt 8.13).
const STANDARD_PHASEN: { phase_nr: number; bezeichnung: string; honorar_prozent: number }[] = [
  { phase_nr: 1, bezeichnung: 'Grundlagenermittlung', honorar_prozent: 2 },
  { phase_nr: 2, bezeichnung: 'Vorplanung', honorar_prozent: 7 },
  { phase_nr: 3, bezeichnung: 'Entwurfsplanung', honorar_prozent: 15 },
  { phase_nr: 4, bezeichnung: 'Genehmigungsplanung', honorar_prozent: 3 },
  { phase_nr: 5, bezeichnung: 'Ausführungsplanung', honorar_prozent: 25 },
  { phase_nr: 6, bezeichnung: 'Vorbereitung der Vergabe', honorar_prozent: 10 },
  { phase_nr: 7, bezeichnung: 'Mitwirkung bei der Vergabe', honorar_prozent: 4 },
  { phase_nr: 8, bezeichnung: 'Objektüberwachung (Bauüberwachung)', honorar_prozent: 32 },
  { phase_nr: 9, bezeichnung: 'Objektbetreuung', honorar_prozent: 2 },
]

const STATUS_LABEL: Record<Phase['status'], string> = {
  nicht_begonnen: 'Nicht begonnen',
  in_bearbeitung: 'In Bearbeitung',
  abgeschlossen: 'Abgeschlossen',
}
const STATUS_VARIANTE: Record<Phase['status'], 'ok' | 'warn' | 'neutral'> = {
  nicht_begonnen: 'neutral',
  in_bearbeitung: 'warn',
  abgeschlossen: 'ok',
}
const SEGMENT_FARBE: Record<Phase['status'], string> = {
  nicht_begonnen: 'rgba(23,20,14,.10)',
  in_bearbeitung: 'var(--orange)',
  abgeschlossen: '#3F7D4A',
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// HOAI-Leistungsphasen-Tracking (Konzept Abschnitt 8.10/13) - laut Konzept
// selbst "strukturelles Rückgrat der Planungsphase" und einer von vier
// Punkten, die die Normen-/Verwaltungstiefe gegenüber reinen Mängel-Apps
// wie PlanRadar/Capmo ausmachen (Abschnitt 5). Verwaltung bleibt beim
// Projekteigentümer (wie bei Genehmigungen), Fortschritt ist für alle
// Projektbeteiligten sichtbar.
export default function Leistungsphasen({ projektId, istEigentuemer }: { projektId: string; istEigentuemer: boolean }) {
  const [phasen, setPhasen] = useState<Phase[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [anlegenLaeuft, setAnlegenLaeuft] = useState(false)
  const [offenePhase, setOffenePhase] = useState<string | null>(null)
  const [speichertId, setSpeichertId] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const { data } = await supabase
      .from('leistungsphasen')
      .select('id, phase_nr, bezeichnung, honorar_prozent, status, start_datum, ende_datum, notiz')
      .eq('projekt_id', projektId)
      .order('phase_nr', { ascending: true })
    setPhasen((data ?? []) as Phase[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function standardphasenAnlegen() {
    setAnlegenLaeuft(true)
    await supabase.from('leistungsphasen').insert(
      STANDARD_PHASEN.map((p) => ({ ...p, projekt_id: projektId }))
    )
    setAnlegenLaeuft(false)
    await laden()
  }

  async function feldAktualisieren(id: string, felder: Partial<Pick<Phase, 'status' | 'start_datum' | 'ende_datum' | 'notiz'>>) {
    setSpeichertId(id)
    setPhasen((prev) => prev.map((p) => (p.id === id ? { ...p, ...felder } : p)))
    await supabase.from('leistungsphasen').update({ ...felder, aktualisiert_am: new Date().toISOString() }).eq('id', id)
    setSpeichertId(null)
  }

  const fortschrittProzent = useMemo(() => {
    return phasen.reduce((summe, p) => {
      if (p.status === 'abgeschlossen') return summe + p.honorar_prozent
      if (p.status === 'in_bearbeitung') return summe + p.honorar_prozent * 0.5
      return summe
    }, 0)
  }, [phasen])

  if (ladeStatus === 'laedt') return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>

  if (phasen.length === 0) {
    return (
      <div style={karteStil}>
        <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: 13.5 }}>
          Für dieses Projekt sind noch keine Leistungsphasen angelegt.
        </p>
        {istEigentuemer ? (
          <button style={{ ...knopfStil, marginTop: 14 }} onClick={standardphasenAnlegen} disabled={anlegenLaeuft}>
            {anlegenLaeuft ? 'Legt an …' : 'Standard-Leistungsphasen (HOAI 1–9) anlegen'}
          </button>
        ) : (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-faint)' }}>
            Das übernimmt der Projekteigentümer.
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ ...karteStil, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>Honorar-Fortschritt</span>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 15, fontWeight: 700, color: 'var(--olive-light)' }}>
            {fortschrittProzent.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3, height: 10, borderRadius: 6, overflow: 'hidden' }}>
          {phasen.map((p) => (
            <div
              key={p.id}
              title={`LPh ${p.phase_nr} ${p.bezeichnung}: ${STATUS_LABEL[p.status]}`}
              style={{ flex: p.honorar_prozent, background: SEGMENT_FARBE[p.status] }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {phasen.map((p) => {
          const offen = offenePhase === p.id
          return (
            <div key={p.id} style={karteStil}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: istEigentuemer ? 'pointer' : 'default' }}
                onClick={() => istEigentuemer && setOffenePhase(offen ? null : p.id)}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--ink-faint)', minWidth: 44 }}>
                    LPh {p.phase_nr}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 700 }}>{p.bezeichnung}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>{p.honorar_prozent} % Honoraranteil</span>
                </div>
                <span style={pillStil(STATUS_VARIANTE[p.status])}>{STATUS_LABEL[p.status]}</span>
              </div>

              {(p.start_datum || p.ende_datum) && !offen && (
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--ink-faint)' }}>
                  {p.start_datum ? formatDatum(p.start_datum) : '–'} bis {p.ende_datum ? formatDatum(p.ende_datum) : 'offen'}
                </p>
              )}

              {istEigentuemer && offen && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(Object.keys(STATUS_LABEL) as Phase['status'][]).map((s) => (
                      <button
                        key={s}
                        onClick={() => feldAktualisieren(p.id, { status: s })}
                        disabled={speichertId === p.id}
                        style={{
                          ...knopfStil,
                          padding: '6px 14px',
                          fontSize: 11.5,
                          background: p.status === s ? 'var(--orange)' : 'transparent',
                          color: p.status === s ? 'var(--on-accent)' : 'var(--ink-dim)',
                          border: p.status === s ? 'none' : '1px solid var(--glass-border)',
                        }}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)', flex: '1 1 140px' }}>
                      Start
                      <input
                        type="date"
                        style={eingabeStil}
                        value={p.start_datum ?? ''}
                        onChange={(e) => feldAktualisieren(p.id, { start_datum: e.target.value || null })}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)', flex: '1 1 140px' }}>
                      Ende
                      <input
                        type="date"
                        style={eingabeStil}
                        value={p.ende_datum ?? ''}
                        onChange={(e) => feldAktualisieren(p.id, { ende_datum: e.target.value || null })}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)' }}>
                    Notiz
                    <textarea
                      style={{ ...eingabeStil, minHeight: 56, resize: 'vertical', fontFamily: 'var(--font-body)' }}
                      value={p.notiz ?? ''}
                      onChange={(e) => setPhasen((prev) => prev.map((x) => (x.id === p.id ? { ...x, notiz: e.target.value } : x)))}
                      onBlur={(e) => feldAktualisieren(p.id, { notiz: e.target.value || null })}
                    />
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="footnote">
        Standard-Leistungsbild „Gebäude und Innenräume" nach HOAI § 34 mit den dort üblichen
        Honorar-Prozentsätzen (1–9, Summe 100 %) – bewusst gleich für jedes Projekt, ohne automatische
        Anpassung je Gebäudeklasse (z. B. WEG-Sondereigentum). Reine Fortschritts- und Terminverfolgung,
        keine Honorarberechnung/-abrechnung und keine automatische Verknüpfung zu Rechnungen.
      </p>
    </div>
  )
}
