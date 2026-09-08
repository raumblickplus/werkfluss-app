import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, pillStil, projektStatusLabel, projektStatusVariante } from './stil'

type ProjektZeile = {
  id: string
  name: string
  status: string
  start_datum: string | null
  end_datum_geplant: string | null
}

type Aufgabe = {
  id: string
  titel: string
  status: 'offen' | 'in_bearbeitung' | 'erledigt'
  faellig_am: string | null
  gewerk: string | null
  projekt_id: string
}

function alsIsoDatum(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function montag(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
function addTage(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function tageZwischen(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
function formatKurz(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
function datumLabel(iso: string, heute: Date) {
  if (iso === alsIsoDatum(heute)) return 'Heute'
  if (iso === alsIsoDatum(addTage(heute, 1))) return 'Morgen'
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

const LABEL_SPALTE = 190

export default function Zeitplan() {
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<ProjektZeile[]>([])
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: pData }, { data: aData }] = await Promise.all([
      supabase
        .from('projekte')
        .select('id, name, status, start_datum, end_datum_geplant')
        .neq('status', 'abgeschlossen')
        .order('start_datum', { ascending: true, nullsFirst: false }),
      supabase
        .from('aufgaben')
        .select('id, titel, status, faellig_am, gewerk, projekt_id')
        .neq('status', 'erledigt')
        .not('faellig_am', 'is', null)
        .order('faellig_am', { ascending: true }),
    ])
    setProjekte((pData ?? []) as ProjektZeile[])
    setAufgaben((aData ?? []) as Aufgabe[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [])

  async function aufgabeErledigen(id: string) {
    setAufgaben((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('aufgaben').update({ status: 'erledigt' }).eq('id', id)
  }

  const heute = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const heuteIso = alsIsoDatum(heute)
  const projektName = (id: string) => projekte.find((p) => p.id === id)?.name ?? 'Unbekanntes Projekt'

  const projekteMitZeitraum = projekte.filter((p) => p.start_datum && p.end_datum_geplant)
  const projekteOhneZeitraum = projekte.filter((p) => !p.start_datum || !p.end_datum_geplant)

  const { rangeStart, totalTage, monatsBuckets } = useMemo(() => {
    let start = addTage(heute, -14)
    let end = addTage(heute, 120)
    for (const p of projekteMitZeitraum) {
      const s = new Date(p.start_datum!)
      const e = new Date(p.end_datum_geplant!)
      if (s < start) start = s
      if (e > end) end = e
    }
    const absMin = addTage(heute, -365)
    const absMax = addTage(heute, 730)
    if (start < absMin) start = absMin
    if (end > absMax) end = absMax
    start = montag(start)
    end = addTage(montag(end), 6)
    const gesamt = tageZwischen(start, end) + 1

    const buckets: { key: string; label: string; tage: number }[] = []
    for (let i = 0; i < gesamt; i++) {
      const d = addTage(start, i)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const label = d.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })
      const letzter = buckets[buckets.length - 1]
      if (letzter && letzter.key === key) letzter.tage += 1
      else buckets.push({ key, label, tage: 1 })
    }
    return { rangeStart: start, totalTage: gesamt, monatsBuckets: buckets }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projekte, heute])

  const heuteOffsetPct = Math.min(100, Math.max(0, (tageZwischen(rangeStart, heute) / totalTage) * 100))

  const ueberfaellig = aufgaben.filter((a) => a.faellig_am! < heuteIso)
  const dreiWochenGrenze = alsIsoDatum(addTage(heute, 21))
  const naeher = aufgaben.filter((a) => a.faellig_am! >= heuteIso && a.faellig_am! <= dreiWochenGrenze)
  const weitereAnzahl = aufgaben.length - ueberfaellig.length - naeher.length

  const naeherGruppiert: { datum: string; eintraege: Aufgabe[] }[] = []
  for (const a of naeher) {
    const letzte = naeherGruppiert[naeherGruppiert.length - 1]
    if (letzte && letzte.datum === a.faellig_am) letzte.eintraege.push(a)
    else naeherGruppiert.push({ datum: a.faellig_am!, eintraege: [a] })
  }

  return (
    <AppShell title="Zeitplan" subtitle={aktivFirma?.name} wide>
      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
            <div className="stat liquid" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Im Zeitstrahl</div>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>{projekteMitZeitraum.length}</div>
            </div>
            <div className="stat liquid" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Überfällige Termine</div>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4, color: ueberfaellig.length ? 'var(--red)' : 'inherit' }}>{ueberfaellig.length}</div>
            </div>
            <div className="stat liquid" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Nächste 3 Wochen</div>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>{naeher.length}</div>
            </div>
            <div className="stat liquid" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Ohne Zeitraum</div>
              <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4 }}>{projekteOhneZeitraum.length}</div>
            </div>
          </div>

          <div style={{ ...karteStil, marginBottom: 24, overflowX: 'auto' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 16px' }}>Zeitstrahl</h2>
            {projekteMitZeitraum.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
                Noch keine Projekte mit Baubeginn/Fertigstellung. Trage beide Termine in der Projekt-Übersicht ein,
                damit sie hier als Balken erscheinen.
              </p>
            ) : (
              <div style={{ minWidth: 640, position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `calc(${LABEL_SPALTE}px + (100% - ${LABEL_SPALTE}px) * ${heuteOffsetPct / 100})`,
                    width: 2, background: 'var(--red)', opacity: 0.5, pointerEvents: 'none',
                  }}
                >
                  <div style={{ position: 'absolute', top: -18, left: -14, fontSize: 9.5, fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>
                    Heute
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: LABEL_SPALTE, flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex' }}>
                    {monatsBuckets.map((b) => (
                      <div
                        key={b.key}
                        style={{
                          flexGrow: b.tage, flexBasis: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--ink-faint)',
                          textTransform: 'uppercase', letterSpacing: '.04em', borderLeft: '1px solid var(--glass-border)', paddingLeft: 6,
                        }}
                      >
                        {b.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projekteMitZeitraum.map((p) => {
                    const s = new Date(p.start_datum!)
                    const e = new Date(p.end_datum_geplant!)
                    const leftPct = Math.max(0, (tageZwischen(rangeStart, s) / totalTage) * 100)
                    const widthPct = Math.max(((tageZwischen(s, e) + 1) / totalTage) * 100, 1.4)
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link
                          to={`/projekte/${p.id}`}
                          style={{
                            width: LABEL_SPALTE, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                            textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                          title={p.name}
                        >
                          {p.name}
                        </Link>
                        <div style={{ flex: 1, position: 'relative', height: 28 }}>
                          <Link
                            to={`/projekte/${p.id}`}
                            title={`${p.name}: ${formatKurz(p.start_datum!)} – ${formatKurz(p.end_datum_geplant!)}`}
                            style={{
                              position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`, top: 3, height: 22,
                              borderRadius: 999, textDecoration: 'none', display: 'flex', alignItems: 'center',
                              padding: '0 10px', overflow: 'hidden',
                              background: p.status === 'planung'
                                ? 'rgba(40,28,14,.16)'
                                : 'linear-gradient(135deg, var(--orange), var(--orange-deep))',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                                color: p.status === 'planung' ? 'var(--ink-dim)' : 'oklch(20% 0.02 60)',
                              }}
                            >
                              {formatKurz(p.start_datum!)} – {formatKurz(p.end_datum_geplant!)}
                            </span>
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 20 }}>
            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Anstehende Termine</h2>
              {aufgaben.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Keine offenen Aufgaben mit Fälligkeitsdatum.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {ueberfaellig.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                        Überfällig
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {ueberfaellig.map((a) => (
                          <TerminZeile key={a.id} aufgabe={a} projektName={projektName(a.projekt_id)} onErledigt={aufgabeErledigen} pillVariante="bad" pillText={formatKurz(a.faellig_am!)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {naeherGruppiert.map((gruppe) => (
                    <div key={gruppe.datum}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                        {datumLabel(gruppe.datum, heute)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {gruppe.eintraege.map((a) => (
                          <TerminZeile key={a.id} aufgabe={a} projektName={projektName(a.projekt_id)} onErledigt={aufgabeErledigen} pillVariante="neutral" pillText={a.gewerk ?? undefined} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {weitereAnzahl > 0 && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>+ {weitereAnzahl} weitere Termine später</p>
                  )}
                </div>
              )}
            </div>

            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Projekte ohne Zeitraum</h2>
              {projekteOhneZeitraum.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Jedes laufende Projekt hat Baubeginn und Fertigstellung gesetzt.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projekteOhneZeitraum.map((p) => (
                    <Link
                      key={p.id}
                      to={`/projekte/${p.id}`}
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
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--ink-faint)' }}>
                    Zeitraum eintragen: Projekt öffnen → Übersicht → Baubeginn/Fertigstellung.
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="footnote">
            Der Zeitstrahl baut auf Baubeginn/Fertigstellung je Projekt und den Fälligkeitsdaten der Aufgaben auf.
            Gewerke-Abhängigkeiten, kritischer Pfad, Meilensteine und Kalendersync (Apple/Google/Outlook) sind als
            nächste Ausbaustufe vorgesehen.
          </p>
        </>
      )}
    </AppShell>
  )
}

function TerminZeile({
  aufgabe, projektName, onErledigt, pillVariante, pillText,
}: {
  aufgabe: Aufgabe
  projektName: string
  onErledigt: (id: string) => void
  pillVariante: 'ok' | 'warn' | 'bad' | 'neutral'
  pillText?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)' }}>
      <button
        onClick={() => onErledigt(aufgabe.id)}
        title="Als erledigt markieren"
        style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--glass-border)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
      />
      <Link to={`/projekte/${aufgabe.projekt_id}?tab=aufgaben`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--ink)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aufgabe.titel}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projektName}</div>
      </Link>
      {pillText && <span style={pillStil(pillVariante)}>{pillText}</span>}
    </div>
  )
}
