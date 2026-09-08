import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, pillStil } from './stil'

type Projekt = { id: string; name: string; status: string }
type Aufgabe = { id: string; titel: string; gewerk: string | null; faellig_am: string | null; status: string; projekt_id: string }
type Mangel = { id: string; titel: string; dringlichkeit: 'kritisch' | 'mittel' | 'gering'; status: string; frist: string | null; projekt_id: string }
type Rechnung = { id: string; rechnungsnummer: string; summe_netto_cents: number; status: string; faellig_am: string | null; projekt_id: string }
type WetterArt = 'sonne' | 'teilweise_bewoelkt' | 'bewoelkt' | 'regen' | 'schnee' | 'gewitter' | 'nebel'
type WetterDaten = { temperatur: number; art: WetterArt }

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function alsIsoDatum(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function istHeute(datum: string | null, heuteIso: string) {
  return datum === heuteIso
}
function istUeberfaellig(datum: string | null, heuteIso: string) {
  if (!datum) return false
  return datum < heuteIso
}
function begruessung(stunde: number) {
  if (stunde < 5) return 'Noch wach'
  if (stunde < 11) return 'Guten Morgen'
  if (stunde < 18) return 'Guten Tag'
  if (stunde < 22) return 'Guten Abend'
  return 'Gute Nacht'
}

function wetterCodeZuArt(code: number): WetterArt {
  if (code === 0) return 'sonne'
  if (code === 1 || code === 2) return 'teilweise_bewoelkt'
  if (code === 45 || code === 48) return 'nebel'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'regen'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'schnee'
  if ([95, 96, 99].includes(code)) return 'gewitter'
  return 'bewoelkt'
}

const wetterLabel: Record<WetterArt, string> = {
  sonne: 'Klarer Himmel',
  teilweise_bewoelkt: 'Leicht bewölkt',
  bewoelkt: 'Bewölkt',
  regen: 'Regen',
  schnee: 'Schnee',
  gewitter: 'Gewitter',
  nebel: 'Nebel',
}
const baustellenHinweis: Record<WetterArt, string> = {
  sonne: 'Gutes Wetter für Außenarbeiten.',
  teilweise_bewoelkt: 'Solide Bedingungen für die Baustelle.',
  bewoelkt: 'Trocken, aber bedeckt – normale Bedingungen.',
  regen: 'Regenschutz und Bodenplanen einplanen.',
  schnee: 'Vorsicht bei Außenarbeiten – Glätte möglich.',
  gewitter: 'Kran- und Gerüstarbeiten heute besser meiden.',
  nebel: 'Eingeschränkte Sicht – Vorsicht bei Anlieferungen.',
}

const CLOUD = 'M6.5 15h10a3.2 3.2 0 0 0 .4-6.38A4.6 4.6 0 0 0 7.6 7.2 3.2 3.2 0 0 0 6.5 15Z'

function WetterIcon({ art, groesse = 40 }: { art: WetterArt; groesse?: number }) {
  const props = {
    width: groesse, height: groesse, viewBox: '0 0 24 24', fill: 'none' as const,
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (art) {
    case 'sonne':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4.6" />
          <path d="M12 2.5v2.6M12 18.9v2.6M4.2 4.2l1.9 1.9M17.9 17.9l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.2 19.8l1.9-1.9M17.9 6.1l1.9-1.9" />
        </svg>
      )
    case 'teilweise_bewoelkt':
      return (
        <svg {...props}>
          <circle cx="6" cy="6.5" r="2.3" />
          <path d="M6 2.7v1.3M2.6 4l.9.9M9.9 4l-.9.9" />
          <path d={CLOUD} />
        </svg>
      )
    case 'bewoelkt':
      return <svg {...props}><path d={CLOUD} /></svg>
    case 'nebel':
      return (
        <svg {...props}>
          <path d={CLOUD} />
          <path d="M5 18h5M12 18h7M8 21h9" />
        </svg>
      )
    case 'regen':
      return (
        <svg {...props}>
          <path d={CLOUD} />
          <path d="M8 18l-1.2 2.6M12 18l-1.2 2.6M16 18l-1.2 2.6" />
        </svg>
      )
    case 'schnee':
      return (
        <svg {...props}>
          <path d={CLOUD} />
          <path d="M8 18v.01M12 18.4v.01M16 18v.01M8 21v.01M12 21.4v.01M16 21v.01" strokeWidth={2.6} />
        </svg>
      )
    case 'gewitter':
      return (
        <svg {...props}>
          <path d={CLOUD} />
          <path d="M12.5 16l-2.5 4h2.4l-1.4 3.2" />
        </svg>
      )
  }
}

const dringlichkeitVariante: Record<Mangel['dringlichkeit'], 'ok' | 'warn' | 'bad' | 'neutral'> = {
  kritisch: 'bad', mittel: 'warn', gering: 'neutral',
}
const dringlichkeitLabel: Record<Mangel['dringlichkeit'], string> = {
  kritisch: 'Kritisch', mittel: 'Mittel', gering: 'Gering',
}

export default function Dashboard() {
  const { session, aktivFirma } = useAuth()
  const [vorname, setVorname] = useState('')
  const [jetzt, setJetzt] = useState(new Date())
  const [wetter, setWetter] = useState<WetterDaten | 'nicht_verfuegbar' | null>(null)

  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  useEffect(() => {
    const timer = setInterval(() => setJetzt(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const nutzerId = session?.user?.id
    if (!nutzerId) return
    supabase.from('profile').select('vollname').eq('id', nutzerId).maybeSingle().then(({ data }) => {
      const voll = data?.vollname?.trim()
      if (voll) setVorname(voll.split(' ')[0])
    })
  }, [session?.user?.id])

  useEffect(() => {
    if (!navigator.geolocation) { setWetter('nicht_verfuegbar'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`)
          .then((r) => r.json())
          .then((data) => {
            if (data?.current) {
              setWetter({ temperatur: Math.round(data.current.temperature_2m), art: wetterCodeZuArt(data.current.weather_code) })
            } else {
              setWetter('nicht_verfuegbar')
            }
          })
          .catch(() => setWetter('nicht_verfuegbar'))
      },
      () => setWetter('nicht_verfuegbar'),
      { timeout: 8000 }
    )
  }, [])

  useEffect(() => {
    async function laden() {
      setLadeStatus('laedt')
      const [{ data: pData }, { data: aData }, { data: mData }, { data: rData }] = await Promise.all([
        supabase.from('projekte').select('id, name, status'),
        supabase
          .from('aufgaben')
          .select('id, titel, gewerk, faellig_am, status, projekt_id')
          .neq('status', 'erledigt')
          .order('faellig_am', { ascending: true, nullsFirst: false }),
        supabase
          .from('maengel')
          .select('id, titel, dringlichkeit, status, frist, projekt_id')
          .in('status', ['offen', 'in_bearbeitung'])
          .order('dringlichkeit', { ascending: true }),
        supabase
          .from('rechnungen_ausgang')
          .select('id, rechnungsnummer, summe_netto_cents, status, faellig_am, projekt_id')
          .in('status', ['offen', 'ueberfaellig'])
          .order('faellig_am', { ascending: true, nullsFirst: false }),
      ])
      setProjekte((pData ?? []) as Projekt[])
      setAufgaben((aData ?? []) as Aufgabe[])
      setMaengel((mData ?? []) as Mangel[])
      setRechnungen((rData ?? []) as Rechnung[])
      setLadeStatus('bereit')
    }
    laden()
  }, [])

  async function aufgabeErledigen(id: string) {
    setAufgaben((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('aufgaben').update({ status: 'erledigt' }).eq('id', id)
  }

  const heuteIso = alsIsoDatum(jetzt)
  const projektName = (id: string) => projekte.find((p) => p.id === id)?.name ?? 'Unbekanntes Projekt'

  const aktiveProjekte = projekte.filter((p) => p.status === 'ausfuehrung' || p.status === 'abnahme').length
  const kritischeMaengel = maengel.filter((m) => m.dringlichkeit === 'kritisch').length
  const heutigeAufgaben = aufgaben.filter((a) => istHeute(a.faellig_am, heuteIso) || istUeberfaellig(a.faellig_am, heuteIso))
  const rechnungenSummeCents = rechnungen.reduce((sum, r) => sum + r.summe_netto_cents, 0)

  const dringendeMaengel = [...maengel]
    .sort((a, b) => ({ kritisch: 0, mittel: 1, gering: 2 }[a.dringlichkeit] - { kritisch: 0, mittel: 1, gering: 2 }[b.dringlichkeit]))
    .slice(0, 6)

  return (
    <AppShell title="Dashboard" subtitle={aktivFirma?.name} wide>
      {/* Begrüßung, Uhrzeit, Wetter */}
      <div style={{ ...karteStil, padding: '30px 36px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 3.4vw, 42px)', fontWeight: 700, margin: '6px 0 0', letterSpacing: '-0.02em' }}>
            {begruessung(jetzt.getHours())}{vorname ? `, ${vorname}` : ''}.
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-dim)' }}>
            {heutigeAufgaben.length > 0
              ? `${heutigeAufgaben.length} Sache${heutigeAufgaben.length === 1 ? '' : 'n'} für heute auf dem Tisch – hier ist dein Überblick.`
              : 'Für heute steht nichts Dringendes an – hier ist trotzdem dein Überblick.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>Aktuelle Uhrzeit</div>
          </div>

          {wetter && wetter !== 'nicht_verfuegbar' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderLeft: '1px solid var(--glass-border)', paddingLeft: 24 }}>
              <div style={{ color: 'var(--orange-deep)' }}><WetterIcon art={wetter.art} /></div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{wetter.temperatur}°C</div>
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4, maxWidth: 160 }}>
                  {wetterLabel[wetter.art]} · {baustellenHinweis[wetter.art]}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}

      {ladeStatus === 'bereit' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
            <div className="stat liquid" style={{ padding: '22px 24px' }}>
              <div className="num" style={{ fontSize: 40 }}>{projekte.length}</div>
              <div className="lbl" style={{ fontSize: 12.5, marginTop: 5 }}>Projekte gesamt · {aktiveProjekte} in Ausführung/Abnahme</div>
            </div>
            <div className="stat liquid" style={{ padding: '22px 24px' }}>
              <div className="num" style={{ fontSize: 40, color: kritischeMaengel > 0 ? 'var(--red)' : undefined }}>{maengel.length}</div>
              <div className="lbl" style={{ fontSize: 12.5, marginTop: 5 }}>Offene Mängel · {kritischeMaengel} kritisch</div>
            </div>
            <div className="stat liquid" style={{ padding: '22px 24px' }}>
              <div className="num" style={{ fontSize: 40, color: heutigeAufgaben.length > 0 ? 'var(--red)' : undefined }}>{aufgaben.length}</div>
              <div className="lbl" style={{ fontSize: 12.5, marginTop: 5 }}>Offene Aufgaben · {heutigeAufgaben.length} heute/überfällig</div>
            </div>
            <div className="stat liquid" style={{ padding: '22px 24px' }}>
              <div className="num" style={{ fontSize: 40 }}>{euro.format(rechnungenSummeCents / 100)}</div>
              <div className="lbl" style={{ fontSize: 12.5, marginTop: 5 }}>Offene Rechnungen (netto, {rechnungen.length})</div>
            </div>
          </div>

          {/* Heute im Blick – actionable Tagesliste */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 14, color: 'var(--ink-faint)', margin: '0 0 10px', fontWeight: 700 }}>
              Heute im Blick
            </h3>
            <div style={{ ...karteStil, padding: '8px 10px' }}>
              {heutigeAufgaben.length === 0 && (
                <p style={{ padding: 16, color: 'var(--ink-faint)', fontSize: 13.5 }}>
                  Keine fälligen oder überfälligen Aufgaben für heute – guter Tag zum Vorarbeiten.
                </p>
              )}
              {heutigeAufgaben.map((a) => {
                const ueberfaellig = istUeberfaellig(a.faellig_am, heuteIso)
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 12px', borderBottom: '1px solid rgba(40,28,14,.08)' }}>
                    <button
                      onClick={() => aufgabeErledigen(a.id)}
                      title="Als erledigt markieren"
                      style={{
                        all: 'unset', width: 22, height: 22, borderRadius: 8, border: '1.5px solid var(--glass-border)',
                        flexShrink: 0, cursor: 'pointer',
                      }}
                    />
                    <Link to={`/projekte/${a.projekt_id}?tab=aufgaben`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titel}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                        {projektName(a.projekt_id)}{a.gewerk ? ` · ${a.gewerk}` : ''}
                      </div>
                    </Link>
                    <span style={pillStil(ueberfaellig ? 'bad' : 'warn')}>{ueberfaellig ? 'Überfällig' : 'Heute fällig'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
            <div>
              <h3 style={{ fontSize: 14, color: 'var(--ink-faint)', margin: '0 0 10px', fontWeight: 700 }}>
                Dringende Mängel
              </h3>
              <div style={{ ...karteStil, padding: '8px 10px' }}>
                {dringendeMaengel.length === 0 && (
                  <p style={{ padding: 16, color: 'var(--ink-faint)', fontSize: 13.5 }}>Keine offenen Mängel – gute Lage.</p>
                )}
                {dringendeMaengel.map((m) => (
                  <Link
                    key={m.id}
                    to={`/projekte/${m.projekt_id}?tab=maengel`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 12px', borderBottom: '1px solid rgba(40,28,14,.08)', textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.titel}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                        {projektName(m.projekt_id)}{m.frist ? ` · Frist ${new Date(m.frist).toLocaleDateString('de-DE')}` : ''}
                      </div>
                    </div>
                    <span style={pillStil(dringlichkeitVariante[m.dringlichkeit])}>{dringlichkeitLabel[m.dringlichkeit]}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 14, color: 'var(--ink-faint)', margin: '0 0 10px', fontWeight: 700 }}>
                Rechnungen prüfen
              </h3>
              <div style={{ ...karteStil, padding: '8px 10px' }}>
                {rechnungen.length === 0 && (
                  <p style={{ padding: 16, color: 'var(--ink-faint)', fontSize: 13.5 }}>Keine offenen Rechnungen.</p>
                )}
                {rechnungen.slice(0, 6).map((r) => {
                  const ueberfaellig = istUeberfaellig(r.faellig_am, heuteIso)
                  return (
                    <Link
                      key={r.id}
                      to={`/projekte/${r.projekt_id}?tab=rechnungen`}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 12px', borderBottom: '1px solid rgba(40,28,14,.08)', textDecoration: 'none', color: 'inherit' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.rechnungsnummer}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                          {projektName(r.projekt_id)} · {euro.format(r.summe_netto_cents / 100)} netto
                        </div>
                      </div>
                      <span style={pillStil(ueberfaellig ? 'bad' : 'neutral')}>
                        {ueberfaellig ? 'Überfällig' : r.faellig_am ? new Date(r.faellig_am).toLocaleDateString('de-DE') : 'Offen'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          <p className="footnote">
            Echter Kalender (Termine, Zeitstrahl je Projekt) und Wetterdaten je Baustellenadresse folgen,
            sobald Zeitplan als eigenes Modul angebunden ist – aktuell zeigt das Wetter deinen aktuellen
            Standort. Freigabekompetenzen/BWA folgen mit der Buchhaltung.
          </p>
        </>
      )}
    </AppShell>
  )
}
