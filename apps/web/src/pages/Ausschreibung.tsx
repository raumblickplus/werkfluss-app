import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { KachelLink } from '../components/Kachel'
import { karteStil, pillStil, projektStatusLabel, projektStatusVariante } from './stil'

// Projektübergreifende Übersicht für "Ausschreibung & LV" - bisher der
// letzte verbliebene Sidebar-Punkt aus der ursprünglichen Konzept-Gruppe
// "Zusammenarbeit", der noch auf den reinen Platzhalter (ModulPlatzhalter)
// zeigte, obwohl der zugehörige Projekt-Reiter (Ausschreibung.tsx im
// Projekt) längst produktiv ist. Analog zu Zeitplan/Tagesbericht/Mängel/
// Finanzen: reine Aggregation über alle Projekte, keine neue Funktion -
// die automatische VOB-/StLB-Bau-Textvorbefüllung und die
// KI-Vorschläge fürs LV gibt es bereits je Projekt (Tab "Ausschreibung & LV").

type ProjektZeile = { id: string; name: string; status: string }
type Gewerk = { id: string; name: string }
type LvStatus = 'offen' | 'angefragt' | 'entfallen'
type LvPosition = {
  id: string
  projekt_id: string
  gewerk_id: string | null
  kurztext: string
  status: LvStatus
}
type AngebotStatus = 'entwurf' | 'versendet' | 'angenommen' | 'abgelehnt'
type Angebot = { id: string; projekt_id: string; gewerk: string | null; status: AngebotStatus }

function LvIcon({ groesse = 38 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3.5h8l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 12.5h6M9 16h6" />
    </svg>
  )
}

export default function AusschreibungUebersicht() {
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<ProjektZeile[]>([])
  const [positionen, setPositionen] = useState<LvPosition[]>([])
  const [angebote, setAngebote] = useState<Angebot[]>([])
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: pData }, { data: lvData }, { data: aData }, { data: gData }] = await Promise.all([
      supabase.from('projekte').select('id, name, status'),
      supabase.from('lv_positionen').select('id, projekt_id, gewerk_id, kurztext, status'),
      supabase.from('angebote').select('id, projekt_id, gewerk, status'),
      supabase.from('gewerke').select('id, name'),
    ])
    setProjekte((pData ?? []) as ProjektZeile[])
    setPositionen((lvData ?? []) as LvPosition[])
    setAngebote((aData ?? []) as Angebot[])
    setGewerke((gData ?? []) as Gewerk[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [])

  const gewerkName = (id: string | null) => gewerke.find((g) => g.id === id)?.name ?? 'Ohne Gewerk'

  const offenePositionen = positionen.filter((p) => p.status === 'offen')
  const angefragtePositionen = positionen.filter((p) => p.status === 'angefragt')
  const angeboteVersendet = angebote.filter((a) => a.status === 'versendet')

  const projekteMitAusschreibung = projekte.filter((p) => positionen.some((l) => l.projekt_id === p.id))
  const projekteOhneAusschreibung = projekte.filter(
    (p) => (p.status === 'planung' || p.status === 'ausfuehrung') && !positionen.some((l) => l.projekt_id === p.id)
  )

  const gewerkRanking = useMemo(() => {
    const zaehler = new Map<string, number>()
    for (const p of offenePositionen) {
      const name = gewerkName(p.gewerk_id)
      zaehler.set(name, (zaehler.get(name) ?? 0) + 1)
    }
    return [...zaehler.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offenePositionen, gewerke])

  const gewerkeOffenAnzahl = new Set(offenePositionen.map((p) => p.gewerk_id ?? 'ohne')).size

  const zielOffen = offenePositionen[0] ? `/projekte/${offenePositionen[0].projekt_id}?tab=ausschreibung` : null
  const zielAngebote = angeboteVersendet[0] ? `/projekte/${angeboteVersendet[0].projekt_id}?tab=angebote` : null
  const zielAngefragt = angefragtePositionen[0] ? `/projekte/${angefragtePositionen[0].projekt_id}?tab=ausschreibung` : null
  const zielMitAusschreibung = projekteMitAusschreibung[0] ? `/projekte/${projekteMitAusschreibung[0].id}?tab=ausschreibung` : null
  const zielOhneAusschreibung = projekteOhneAusschreibung[0] ? `/projekte/${projekteOhneAusschreibung[0].id}?tab=ausschreibung` : null

  return (
    <AppShell title="Ausschreibung & LV" subtitle={aktivFirma?.name} wide>
      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 14 }}>
            <KachelLink to={zielOffen} className="block olive-deep" style={{ gridColumn: 'span 7', minWidth: 260 }}>
              <div className="block-ticks" />
              <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LvIcon groesse={14} />
                Offene LV-Positionen
              </div>
              <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{offenePositionen.length}</div>
              <div className="block-sub">
                {offenePositionen.length === 0
                  ? 'Jede angelegte Position hat schon eine Anfrage oder ist entfallen.'
                  : `Noch ohne Angebot angefragt – über ${gewerkeOffenAnzahl} Gewerke verteilt.`}
              </div>
            </KachelLink>
            <KachelLink to={zielAngebote} className={`block ${angeboteVersendet.length > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 5', minWidth: 220 }}>
              <div className="block-lbl">Angebote in Prüfung</div>
              <div className="block-num" style={{ fontSize: 'clamp(30px, 3.2vw, 48px)' }}>{angeboteVersendet.length}</div>
              <div className="block-sub">Versendet, noch keine Rückmeldung.</div>
            </KachelLink>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 24 }}>
            <KachelLink to={zielAngefragt} className="block mustard" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Angefragte Positionen</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(angefragtePositionen.length)}</div>
            </KachelLink>
            <KachelLink to={zielMitAusschreibung} className="block olive" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Projekte mit Ausschreibung</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(projekteMitAusschreibung.length)}</div>
            </KachelLink>
            <KachelLink to={zielOhneAusschreibung} className="block cream" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Projekte ohne Ausschreibung</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(projekteOhneAusschreibung.length)}</div>
            </KachelLink>
            <div className="block dark" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Gewerke offen</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(gewerkeOffenAnzahl)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 20, marginBottom: 24 }}>
            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Projekte ohne Ausschreibung</h2>
              {projekteOhneAusschreibung.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
                  Jedes Projekt in Planung/Ausführung hat mindestens eine LV-Position.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projekteOhneAusschreibung.map((p) => (
                    <Link
                      key={p.id}
                      to={`/projekte/${p.id}?tab=ausschreibung`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '9px 12px', borderRadius: 13, background: 'rgba(255,255,255,.4)',
                        border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)',
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={pillStil(projektStatusVariante[p.status] ?? 'neutral')}>{projektStatusLabel[p.status] ?? p.status}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Offene Positionen je Gewerk</h2>
              {gewerkRanking.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Keine offenen LV-Positionen.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gewerkRanking.map(([name, anzahl]) => {
                    const breite = Math.round((anzahl / gewerkRanking[0][1]) * 100)
                    return (
                      <div key={name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>{name}</span>
                          <span style={{ color: 'var(--ink-faint)' }}>{anzahl}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: 'rgba(40,28,14,.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${breite}%`, borderRadius: 999, background: 'var(--orange-deep)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...karteStil, overflowX: 'auto' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Ausschreibung je Projekt</h2>
            {projekteMitAusschreibung.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Noch keine LV-Positionen angelegt.</p>
            ) : (
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-faint)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                    <th style={{ padding: '0 10px 10px 0', fontWeight: 700 }}>Projekt</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Offen</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Angefragt</th>
                    <th style={{ padding: '0 0 10px 10px', fontWeight: 700 }}>Angebote versendet</th>
                  </tr>
                </thead>
                <tbody>
                  {projekteMitAusschreibung.map((p) => {
                    const pPositionen = positionen.filter((l) => l.projekt_id === p.id)
                    const pOffen = pPositionen.filter((l) => l.status === 'offen')
                    const pAngefragt = pPositionen.filter((l) => l.status === 'angefragt')
                    const pAngebote = angebote.filter((a) => a.projekt_id === p.id && a.status === 'versendet')
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '10px 10px 10px 0' }}>
                          <Link to={`/projekte/${p.id}?tab=ausschreibung`} style={{ textDecoration: 'none', color: 'var(--ink)', fontWeight: 600 }}>{p.name}</Link>{' '}
                          <span style={pillStil(projektStatusVariante[p.status] ?? 'neutral')}>{projektStatusLabel[p.status] ?? p.status}</span>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link to={`/projekte/${p.id}?tab=ausschreibung`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pOffen.length}</Link>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link to={`/projekte/${p.id}?tab=ausschreibung`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pAngefragt.length}</Link>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link to={`/projekte/${p.id}?tab=angebote`} style={{ display: 'block', padding: '10px 0 10px 10px', color: 'inherit', textDecoration: 'none' }}>{pAngebote.length}</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="footnote">
            Reine projektübergreifende Zusammenfassung der LV-Positionen und Angebote, die du schon je Projekt im Tab
            „Ausschreibung & LV" pflegst – analog zu Zeitplan, Tagesbericht, Mängel & Abnahme und Finanzen. Die
            automatische VOB-/StLB-Bau-Textvorbefüllung und KI-Vorschläge fürs Leistungsverzeichnis gibt es bereits je
            Projekt; ein offenes Matching mit noch nicht am Projekt beteiligten Handwerkern (Konzept Abschnitt 8.4) ist
            weiterhin nicht Teil dieser Ansicht.
          </p>
        </>
      )}
    </AppShell>
  )
}
