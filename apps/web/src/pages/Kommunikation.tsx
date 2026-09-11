import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { KachelLink } from '../components/Kachel'
import { karteStil, pillStil, projektStatusLabel, projektStatusVariante } from './stil'

// Projektübergreifende Übersicht für "Kommunikation" - der letzte noch
// verbliebene Sidebar-Punkt aus der Konzept-Gruppe "Zusammenarbeit", der
// bisher auf den reinen Platzhalter zeigte, obwohl der Projekt-Chat
// (Kommunikation.tsx im Projekt, projekt_nachrichten seit 0014) längst
// produktiv ist. Analog zu Ausschreibung & LV/Zeitplan/Mängel/Finanzen:
// reine Aggregation über alle Projekte, keine neue Funktion - Live-
// Übersetzung, Videotelefonie und Live-Untertitel bleiben unverändert
// ausschließlich im Projekt-Chat selbst.

type ProjektZeile = { id: string; name: string; status: string }
type Nachricht = {
  id: string
  projekt_id: string
  autor_id: string | null
  text: string
  erstellt_am: string
  profil: string | null
}

function ChatIcon({ groesse = 38 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  )
}

function zeitVor(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min.`
  const diffStd = Math.round(diffMin / 60)
  if (diffStd < 24) return `vor ${diffStd} Std.`
  const diffTage = Math.round(diffStd / 24)
  if (diffTage === 1) return 'gestern'
  if (diffTage < 7) return `vor ${diffTage} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export default function KommunikationUebersicht() {
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<ProjektZeile[]>([])
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: pData }, { data: nData }] = await Promise.all([
      supabase.from('projekte').select('id, name, status'),
      supabase.from('projekt_nachrichten').select('id, projekt_id, autor_id, text, erstellt_am, profile(vollname)'),
    ])
    setProjekte((pData ?? []) as ProjektZeile[])
    setNachrichten(
      ((nData ?? []) as unknown as Array<Omit<Nachricht, 'profil'> & { profile: { vollname: string } | { vollname: string }[] | null }>).map((n) => ({
        ...n,
        profil: Array.isArray(n.profile) ? n.profile[0]?.vollname ?? null : n.profile?.vollname ?? null,
      }))
    )
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [])

  const heuteStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }, [])
  const vor7TagenIso = useMemo(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), [])

  const nachrichtenHeute = nachrichten.filter((n) => n.erstellt_am >= heuteStart)
  const nachrichtenWoche = nachrichten.filter((n) => n.erstellt_am >= vor7TagenIso)

  const projekteMitChat = projekte.filter((p) => nachrichten.some((n) => n.projekt_id === p.id))
  const projekteOhneAktivitaet = projekte.filter(
    (p) => (p.status === 'planung' || p.status === 'ausfuehrung') && !nachrichten.some((n) => n.projekt_id === p.id)
  )

  const letzteJeProjekt = useMemo(() => {
    const karte = new Map<string, Nachricht>()
    for (const n of nachrichten) {
      const bisher = karte.get(n.projekt_id)
      if (!bisher || n.erstellt_am > bisher.erstellt_am) karte.set(n.projekt_id, n)
    }
    return [...karte.entries()]
      .map(([projektId, n]) => ({ projekt: projekte.find((p) => p.id === projektId), nachricht: n }))
      .filter((e): e is { projekt: ProjektZeile; nachricht: Nachricht } => !!e.projekt)
      .sort((a, b) => (a.nachricht.erstellt_am < b.nachricht.erstellt_am ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nachrichten, projekte])

  const zielHeute = nachrichtenHeute[0] ? `/projekte/${nachrichtenHeute[0].projekt_id}?tab=kommunikation` : null
  const zielOhneAktivitaet = projekteOhneAktivitaet[0] ? `/projekte/${projekteOhneAktivitaet[0].id}?tab=kommunikation` : null
  const zielWoche = nachrichtenWoche[0] ? `/projekte/${nachrichtenWoche[0].projekt_id}?tab=kommunikation` : null
  const zielMitChat = projekteMitChat[0] ? `/projekte/${projekteMitChat[0].id}?tab=kommunikation` : null

  return (
    <AppShell title="Kommunikation" subtitle={aktivFirma?.name} wide>
      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 14 }}>
            <KachelLink to={zielHeute} className="block olive-deep" style={{ gridColumn: 'span 7', minWidth: 260 }}>
              <div className="block-ticks" />
              <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChatIcon groesse={14} />
                Nachrichten heute
              </div>
              <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{nachrichtenHeute.length}</div>
              <div className="block-sub">
                {nachrichtenHeute.length === 0
                  ? 'Heute noch keine neue Nachricht in einem deiner Projekte.'
                  : `Über ${new Set(nachrichtenHeute.map((n) => n.projekt_id)).size} Projekt(e) verteilt.`}
              </div>
            </KachelLink>
            <KachelLink to={zielOhneAktivitaet} className={`block ${projekteOhneAktivitaet.length > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 5', minWidth: 220 }}>
              <div className="block-lbl">Projekte ohne Aktivität</div>
              <div className="block-num" style={{ fontSize: 'clamp(30px, 3.2vw, 48px)' }}>{projekteOhneAktivitaet.length}</div>
              <div className="block-sub">In Planung/Ausführung, noch keine Chat-Nachricht.</div>
            </KachelLink>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 24 }}>
            <KachelLink to={zielWoche} className="block mustard" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Nachrichten (7 Tage)</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(nachrichtenWoche.length)}</div>
            </KachelLink>
            <KachelLink to={zielMitChat} className="block olive" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Projekte mit Chat</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(projekteMitChat.length)}</div>
            </KachelLink>
            <KachelLink to={zielOhneAktivitaet} className="block cream" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Ohne Aktivität</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(projekteOhneAktivitaet.length)}</div>
            </KachelLink>
            <div className="block dark" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Nachrichten gesamt</div>
              <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(nachrichten.length)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 20, marginBottom: 24 }}>
            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Letzte Aktivität je Projekt</h2>
              {letzteJeProjekt.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Noch keine Chat-Nachricht in einem deiner Projekte.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {letzteJeProjekt.slice(0, 8).map(({ projekt, nachricht }) => (
                    <Link
                      key={projekt.id}
                      to={`/projekte/${projekt.id}?tab=kommunikation`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '9px 12px', borderRadius: 13, background: 'rgba(255,255,255,.4)',
                        border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projekt.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {nachricht.profil ? `${nachricht.profil}: ` : ''}{nachricht.text}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--ink-faint)', flexShrink: 0 }}>{zeitVor(nachricht.erstellt_am)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Projekte ohne Aktivität</h2>
              {projekteOhneAktivitaet.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
                  Jedes Projekt in Planung/Ausführung hat schon mindestens eine Chat-Nachricht.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projekteOhneAktivitaet.map((p) => (
                    <Link
                      key={p.id}
                      to={`/projekte/${p.id}?tab=kommunikation`}
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
          </div>

          <div style={{ ...karteStil, overflowX: 'auto' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Kommunikation je Projekt</h2>
            {projekteMitChat.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Noch keine Chat-Nachricht angelegt.</p>
            ) : (
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-faint)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                    <th style={{ padding: '0 10px 10px 0', fontWeight: 700 }}>Projekt</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Nachrichten gesamt</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Letzten 7 Tage</th>
                    <th style={{ padding: '0 0 10px 10px', fontWeight: 700 }}>Letzte Aktivität</th>
                  </tr>
                </thead>
                <tbody>
                  {projekteMitChat.map((p) => {
                    const pNachrichten = nachrichten.filter((n) => n.projekt_id === p.id)
                    const pWoche = pNachrichten.filter((n) => n.erstellt_am >= vor7TagenIso)
                    const pLetzte = pNachrichten.reduce((a, b) => (a.erstellt_am > b.erstellt_am ? a : b))
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '10px 10px 10px 0' }}>
                          <Link to={`/projekte/${p.id}?tab=kommunikation`} style={{ textDecoration: 'none', color: 'var(--ink)', fontWeight: 600 }}>{p.name}</Link>{' '}
                          <span style={pillStil(projektStatusVariante[p.status] ?? 'neutral')}>{projektStatusLabel[p.status] ?? p.status}</span>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link to={`/projekte/${p.id}?tab=kommunikation`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pNachrichten.length}</Link>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link to={`/projekte/${p.id}?tab=kommunikation`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pWoche.length}</Link>
                        </td>
                        <td style={{ padding: 0 }}>
                          <Link to={`/projekte/${p.id}?tab=kommunikation`} style={{ display: 'block', padding: '10px 0 10px 10px', color: 'inherit', textDecoration: 'none' }}>{zeitVor(pLetzte.erstellt_am)}</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="footnote">
            Reine projektübergreifende Zusammenfassung der Chat-Nachrichten, die im Tab „Kommunikation" je Projekt
            entstehen – analog zu Ausschreibung & LV, Zeitplan, Mängel & Abnahme und Finanzen. Videotelefonie,
            Live-Untertitel und die automatische Übersetzung bleiben unverändert Funktionen des Projekt-Chats selbst;
            eine ungelesen/gelesen-Markierung je Nachricht gibt es noch nicht, deshalb zeigt diese Ansicht Aktivität
            statt eines Ungelesen-Zählers.
          </p>
        </>
      )}
    </AppShell>
  )
}
