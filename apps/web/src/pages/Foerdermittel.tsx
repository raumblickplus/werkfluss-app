import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { KachelLink } from '../components/Kachel'
import { karteStil, pillStil, projektStatusLabel, projektStatusVariante } from './stil'

// Projektübergreifende Übersicht für "Fördermittel" - wie "Ausschreibung &
// LV" bisher der letzte verbliebene Sidebar-Punkt, der noch auf
// ModulPlatzhalter zeigte, obwohl der zugehörige Projekt-Reiter
// (Foerdermittel.tsx im Projekt: Förderprogramm-Ersteinschätzung +
// Nachweise mit Frist/Status) längst produktiv ist. Analog zu
// Zeitplan/Tagesbericht/Mängel & Abnahme/Finanzen/Ausschreibung & LV:
// reine Aggregation der bereits gepflegten foerdermittel_nachweise, keine
// neue Funktion.

type ProjektZeile = { id: string; name: string; status: string }
type NachweisStatus = 'offen' | 'eingereicht' | 'akzeptiert'
type Nachweis = {
  id: string
  projekt_id: string
  bezeichnung: string
  status: NachweisStatus
  frist: string | null
}

function formatKurz(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function FoerderIcon({ groesse = 38 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 15 6-6M9 9h.01M15 15h.01" />
    </svg>
  )
}

export default function FoerdermittelUebersicht() {
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<ProjektZeile[]>([])
  const [nachweise, setNachweise] = useState<Nachweis[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: pData }, { data: nData }] = await Promise.all([
      supabase.from('projekte').select('id, name, status'),
      supabase
        .from('foerdermittel_nachweise')
        .select('id, projekt_id, bezeichnung, status, frist')
        .order('frist', { ascending: true, nullsFirst: false }),
    ])
    setProjekte((pData ?? []) as ProjektZeile[])
    setNachweise((nData ?? []) as Nachweis[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [])

  const heuteIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const in30TagenIso = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const projektName = (id: string) => projekte.find((p) => p.id === id)?.name ?? 'Unbekanntes Projekt'
  const istOffen = (n: Nachweis) => n.status !== 'akzeptiert'
  const istUeberfaellig = (n: Nachweis) => istOffen(n) && !!n.frist && n.frist < heuteIso
  const istBaldFaellig = (n: Nachweis) => istOffen(n) && !!n.frist && n.frist >= heuteIso && n.frist <= in30TagenIso

  const offeneNachweise = nachweise.filter(istOffen)
  const ueberfaelligeNachweise = nachweise.filter(istUeberfaellig)
  const baldFaelligeNachweise = nachweise.filter(istBaldFaellig)
  const akzeptierteNachweise = nachweise.filter((n) => n.status === 'akzeptiert')
  const projekteMitFoerderung = projekte.filter((p) => nachweise.some((n) => n.projekt_id === p.id))

  const dringendeNachweise = [...offeneNachweise]
    .sort((a, b) => {
      const ua = istUeberfaellig(a), ub = istUeberfaellig(b)
      if (ua !== ub) return ua ? -1 : 1
      return (a.frist ?? '9999') < (b.frist ?? '9999') ? -1 : 1
    })
    .slice(0, 8)

  const zielOffen = dringendeNachweise[0] ? `/projekte/${dringendeNachweise[0].projekt_id}?tab=foerdermittel` : null
  const zielUeberfaellig = ueberfaelligeNachweise[0] ? `/projekte/${ueberfaelligeNachweise[0].projekt_id}?tab=foerdermittel` : null
  const zielBaldFaellig = baldFaelligeNachweise[0] ? `/projekte/${baldFaelligeNachweise[0].projekt_id}?tab=foerdermittel` : null
  const zielProjekt = projekteMitFoerderung[0] ? `/projekte/${projekteMitFoerderung[0].id}?tab=foerdermittel` : null

  return (
    <AppShell title="Fördermittel" subtitle={aktivFirma?.name} wide>
      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 14 }}>
            <KachelLink to={zielOffen} className="block olive-deep" style={{ gridColumn: 'span 7', minWidth: 260 }}>
              <div className="block-ticks" />
              <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FoerderIcon groesse={14} />
                Offene Nachweise
              </div>
              <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{offeneNachweise.length}</div>
              <div className="block-sub">
                {offeneNachweise.length === 0
                  ? 'Kein laufender Förderantrag mit offenen Nachweisen.'
                  : `${ueberfaelligeNachweise.length} davon über der Frist.`}
              </div>
            </KachelLink>
            <KachelLink to={zielUeberfaellig} className={`block ${ueberfaelligeNachweise.length > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 5', minWidth: 220 }}>
              <div className="block-lbl">{ueberfaelligeNachweise.length > 0 ? 'Überfällige Nachweise' : 'Alles im Zeitplan'}</div>
              <div className="block-num" style={{ fontSize: 'clamp(30px, 3.2vw, 48px)' }}>{ueberfaelligeNachweise.length}</div>
              <div className="block-sub">{akzeptierteNachweise.length} Nachweise bereits akzeptiert.</div>
            </KachelLink>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 24 }}>
            <KachelLink to={zielBaldFaellig} className="block mustard" style={{ gridColumn: 'span 4', minWidth: 160 }}>
              <div className="block-lbl">Bald fällig (30 Tage)</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(baldFaelligeNachweise.length)}</div>
            </KachelLink>
            <KachelLink to={zielProjekt} className="block olive" style={{ gridColumn: 'span 4', minWidth: 160 }}>
              <div className="block-lbl">Projekte mit Förderantrag</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(projekteMitFoerderung.length)}</div>
            </KachelLink>
            <div className="block dark" style={{ gridColumn: 'span 4', minWidth: 160 }}>
              <div className="block-lbl">Nachweise gesamt</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(nachweise.length)}</div>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Nachweise mit Frist</h2>
              {dringendeNachweise.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Keine offenen Nachweise – gute Lage.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dringendeNachweise.map((n) => {
                    const ueberf = istUeberfaellig(n)
                    return (
                      <Link
                        key={n.id}
                        to={`/projekte/${n.projekt_id}?tab=foerdermittel`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.bezeichnung}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projektName(n.projekt_id)}</div>
                        </div>
                        {n.frist && <span style={pillStil(ueberf ? 'bad' : 'neutral')}>{formatKurz(n.frist)}</span>}
                        <span style={pillStil(n.status === 'eingereicht' ? 'warn' : 'neutral')}>{n.status === 'eingereicht' ? 'Eingereicht' : 'Offen'}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ ...karteStil, overflowX: 'auto' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Fördermittel je Projekt</h2>
            {projekteMitFoerderung.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Noch keine Fördermittel-Nachweise angelegt.</p>
            ) : (
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-faint)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                    <th style={{ padding: '0 10px 10px 0', fontWeight: 700 }}>Projekt</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Offen</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Eingereicht</th>
                    <th style={{ padding: '0 0 10px 10px', fontWeight: 700 }}>Akzeptiert</th>
                  </tr>
                </thead>
                <tbody>
                  {projekteMitFoerderung.map((p) => {
                    const pNachweise = nachweise.filter((n) => n.projekt_id === p.id)
                    const pOffen = pNachweise.filter((n) => n.status === 'offen')
                    const pEingereicht = pNachweise.filter((n) => n.status === 'eingereicht')
                    const pAkzeptiert = pNachweise.filter((n) => n.status === 'akzeptiert')
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '10px 10px 10px 0' }}>
                          <Link to={`/projekte/${p.id}?tab=foerdermittel`} style={{ textDecoration: 'none', color: 'var(--ink)', fontWeight: 600 }}>{p.name}</Link>{' '}
                          <span style={pillStil(projektStatusVariante[p.status] ?? 'neutral')}>{projektStatusLabel[p.status] ?? p.status}</span>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link to={`/projekte/${p.id}?tab=foerdermittel`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pOffen.length}</Link>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link to={`/projekte/${p.id}?tab=foerdermittel`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pEingereicht.length}</Link>
                        </td>
                        <td style={{ padding: 0, color: 'var(--olive)' }}>
                          <Link to={`/projekte/${p.id}?tab=foerdermittel`} style={{ display: 'block', padding: '10px 0 10px 10px', color: 'inherit', textDecoration: 'none' }}>{pAkzeptiert.length}</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="footnote">
            Reine projektübergreifende Zusammenfassung der Nachweise, die du schon je Projekt im Tab „Fördermittel"
            pflegst – analog zu Zeitplan, Tagesbericht, Mängel & Abnahme, Finanzen und Ausschreibung & LV. Die
            Förderprogramm-Ersteinschätzung (welche KfW-/BAFA-Programme grundsätzlich passen könnten) bleibt bewusst
            je Projekt, da sie von den dort hinterlegten Maßnahmen abhängt.
          </p>
        </>
      )}
    </AppShell>
  )
}
