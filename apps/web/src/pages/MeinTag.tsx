import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, pillStil } from './stil'

// "Mein Tag" - erster, additiver Schritt zu Julians Backlog-Punkt (3)
// vom 10.09.2026 ("eigener Mitarbeiter-/Monteur-Zugang"): morgens auf
// einen Blick sehen, wo man heute gebraucht wird, was zu tun ist und wo
// man übernachtet - gedacht für Monteure, die direkt losfahren, ohne
// vorher ins Büro zu müssen. Nutzt dafür ausschließlich bereits
// vorhandene Daten (aufgaben.zugewiesen_an, projekte.adresse,
// spesen_unterbringung) und bündelt sie firmenübergreifend für die
// eigene Person statt über einzelne Projekt-Reiter verteilt.
//
// Ausdrücklich NICHT umgesetzt (siehe Fußnote unten): ein eigener,
// rollenbeschränkter Login/Zugang nur für Monteure - das würde ein
// neues Auth-/Rollenmodell erfordern (wer darf was sehen, eigene
// Einladungsart usw.) und ist eine größere, noch zu treffende
// Architekturentscheidung. Diese Seite ist mit dem bestehenden Login
// erreichbar, für jeden Nutzer mit seinen eigenen Zuweisungen.

type ProjektInfo = { id: string; name: string; adresse: string | null; kunde_name: string | null; status: string }
type Aufgabe = {
  id: string
  titel: string
  status: 'offen' | 'in_bearbeitung' | 'erledigt'
  faellig_am: string | null
  gewerk: string | null
  projekt_id: string
}
type Unterbringung = {
  id: string
  projekt_id: string
  bezeichnung: string
  zimmer_nr: string | null
  reservierungsnummer: string | null
  von_datum: string | null
  bis_datum: string | null
  notiz: string | null
}

function alsIsoDatum(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatKurz(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
function mapsLink(adresse: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`
}

function PinIcon({ groesse = 38 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.6" />
    </svg>
  )
}

export default function MeinTag() {
  const { aktivFirma, session } = useAuth()
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [projekte, setProjekte] = useState<ProjektInfo[]>([])
  const [unterbringungen, setUnterbringungen] = useState<Unterbringung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  const heuteIso = useMemo(() => alsIsoDatum(new Date()), [])
  const heuteLabel = useMemo(
    () => new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
    []
  )

  async function laden() {
    setLadeStatus('laedt')
    const nutzerId = session?.user?.id
    if (!nutzerId) { setLadeStatus('bereit'); return }

    const { data: aData } = await supabase
      .from('aufgaben')
      .select('id, titel, status, faellig_am, gewerk, projekt_id')
      .eq('zugewiesen_an', nutzerId)
      .neq('status', 'erledigt')
      .not('faellig_am', 'is', null)
      .lte('faellig_am', heuteIso)
      .order('faellig_am', { ascending: true })

    const eigeneAufgaben = (aData ?? []) as Aufgabe[]
    setAufgaben(eigeneAufgaben)

    const projektIds = [...new Set(eigeneAufgaben.map((a) => a.projekt_id))]
    if (projektIds.length > 0) {
      const [{ data: pData }, { data: uData }] = await Promise.all([
        supabase.from('projekte').select('id, name, adresse, kunde_name, status').in('id', projektIds),
        supabase
          .from('spesen_unterbringung')
          .select('id, projekt_id, bezeichnung, zimmer_nr, reservierungsnummer, von_datum, bis_datum, notiz')
          .in('projekt_id', projektIds),
      ])
      setProjekte((pData ?? []) as ProjektInfo[])
      const alleUnterbringungen = (uData ?? []) as Unterbringung[]
      setUnterbringungen(
        alleUnterbringungen.filter(
          (u) => (!u.von_datum || u.von_datum <= heuteIso) && (!u.bis_datum || u.bis_datum >= heuteIso)
        )
      )
    } else {
      setProjekte([])
      setUnterbringungen([])
    }
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [session?.user?.id])

  async function erledigen(id: string) {
    setAufgaben((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('aufgaben').update({ status: 'erledigt' }).eq('id', id)
  }

  const projektInfo = (id: string) => projekte.find((p) => p.id === id)
  const ueberfaellig = aufgaben.filter((a) => a.faellig_am! < heuteIso)

  const gruppen = useMemo(() => {
    const map = new Map<string, Aufgabe[]>()
    for (const a of aufgaben) {
      const liste = map.get(a.projekt_id) ?? []
      liste.push(a)
      map.set(a.projekt_id, liste)
    }
    return [...map.entries()].sort((a, b) => {
      const ua = a[1].some((x) => x.faellig_am! < heuteIso)
      const ub = b[1].some((x) => x.faellig_am! < heuteIso)
      if (ua !== ub) return ua ? -1 : 1
      return (projektInfo(a[0])?.name ?? '').localeCompare(projektInfo(b[0])?.name ?? '')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aufgaben, projekte, heuteIso])

  return (
    <AppShell title="Mein Tag" subtitle={aktivFirma?.name} wide>
      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 24 }}>
            <div className="block olive-deep" style={{ gridColumn: 'span 7', minWidth: 260 }}>
              <div className="block-ticks" />
              <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <PinIcon groesse={14} />
                {heuteLabel}
              </div>
              <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{gruppen.length}</div>
              <div className="block-sub">
                {gruppen.length === 0
                  ? 'Kein Einsatz mit fälliger Aufgabe für heute eingetragen.'
                  : gruppen.length === 1
                    ? '1 Einsatzort heute.'
                    : `${gruppen.length} Einsatzorte heute.`}
              </div>
            </div>
            <div className={`block ${ueberfaellig.length > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 5', minWidth: 220 }}>
              <div className="block-lbl">{ueberfaellig.length > 0 ? 'Überfällige Aufgaben' : 'Alles im Zeitplan'}</div>
              <div className="block-num" style={{ fontSize: 'clamp(30px, 3.2vw, 48px)' }}>{ueberfaellig.length}</div>
              <div className="block-sub">{aufgaben.length} Aufgabe{aufgaben.length === 1 ? '' : 'n'} heute insgesamt zugewiesen.</div>
            </div>
          </div>

          {gruppen.length === 0 ? (
            <div style={karteStil}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
                Dir sind heute keine fälligen oder überfälligen Aufgaben zugewiesen. Zuweisungen erfolgen im Reiter
                „Aufgaben" eines Projekts.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {gruppen.map(([projektId, liste]) => {
                const p = projektInfo(projektId)
                const unterbringung = unterbringungen.find((u) => u.projekt_id === projektId)
                return (
                  <div key={projektId} style={karteStil}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                      <div>
                        <Link to={`/projekte/${projektId}?tab=aufgaben`} style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink)', textDecoration: 'none' }}>
                          {p?.name ?? 'Projekt'}
                        </Link>
                        {p?.kunde_name && (
                          <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>Kunde: {p.kunde_name}</div>
                        )}
                      </div>
                      {p?.adresse && (
                        <a
                          href={mapsLink(p.adresse)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ ...pillStil('neutral'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <PinIcon groesse={11} /> Route zu „{p.adresse}"
                        </a>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {liste.map((a) => {
                        const ueberf = a.faellig_am! < heuteIso
                        return (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)' }}>
                            <button
                              onClick={() => erledigen(a.id)}
                              title="Als erledigt markieren"
                              style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--glass-border)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titel}</div>
                              {a.gewerk && <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{a.gewerk}</div>}
                            </div>
                            <span style={pillStil(ueberf ? 'bad' : 'neutral')}>{ueberf ? `Fällig ${formatKurz(a.faellig_am!)}` : 'Heute'}</span>
                          </div>
                        )
                      })}
                    </div>

                    {unterbringung && (
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', fontSize: 12 }}>
                        <span style={{ fontWeight: 700 }}>Übernachtung: </span>
                        {unterbringung.bezeichnung}
                        {unterbringung.zimmer_nr && `, Zimmer ${unterbringung.zimmer_nr}`}
                        {unterbringung.reservierungsnummer && ` · Res.-Nr. ${unterbringung.reservierungsnummer}`}
                        {unterbringung.notiz && <div style={{ color: 'var(--ink-faint)', marginTop: 2 }}>{unterbringung.notiz}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p className="footnote">
            Zeigt die eigenen, bereits im Reiter „Aufgaben" zugewiesenen Aufgaben mit Fälligkeit heute oder früher,
            gebündelt mit Projektadresse und einer eventuell hinterlegten Unterbringung – projektübergreifend über
            alle eigenen Firmen. Ausdrücklich nicht umgesetzt: ein eigener, rollenbeschränkter Login/Zugang nur für
            Monteure (eigenes Auth-/Rollenmodell, wer darf was sehen), eine Materialliste mit Abholhinweisen (dafür
            fehlt bisher ein Datenmodell), automatische Verhaltenshinweise gegenüber dem Kunden sowie ein
            Offline-Modus. Diese Seite ist ein erster, additiver Schritt mit dem bestehenden Login.
          </p>
        </>
      )}
    </AppShell>
  )
}
