import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, pillStil, knopfSekundaerStil } from './stil'

type ProjektZeile = { id: string; name: string; status: string }
type Eintrag = {
  id: string
  projekt_id: string
  wetter: string | null
  temperatur_grad: number | null
  taetigkeiten: string | null
  besonderheiten: string | null
  kunde_anwesend: boolean
  gewerke: { name: string } | null
}
type Mangel = { id: string; titel: string; dringlichkeit: 'kritisch' | 'mittel' | 'gering'; projekt_id: string }

const dringlichkeitFarbe: Record<Mangel['dringlichkeit'], string> = {
  kritisch: 'var(--red)',
  mittel: 'var(--orange-text)',
  gering: 'var(--ink-faint)',
}

function alsIsoDatum(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseIso(iso: string) {
  const [j, m, t] = iso.split('-').map(Number)
  return new Date(j, m - 1, t)
}
function addTage(d: Date, n: number) {
  const neu = new Date(d)
  neu.setDate(neu.getDate() + n)
  return neu
}
function datumLabel(iso: string, heuteIso: string) {
  if (iso === heuteIso) return 'Heute'
  if (iso === alsIsoDatum(addTage(parseIso(heuteIso), -1))) return 'Gestern'
  return parseIso(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function BuchIcon({ groesse = 38 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3.5h10a1 1 0 0 1 1 1V21l-3.5-2-2.5 2-2.5-2L6 21V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 8.5h6M9 12h6" />
    </svg>
  )
}

export default function Tagesbericht() {
  const { aktivFirma } = useAuth()
  const heuteIso = useMemo(() => alsIsoDatum(new Date()), [])
  const [datum, setDatum] = useState(heuteIso)
  const [projekte, setProjekte] = useState<ProjektZeile[]>([])
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function laden() {
    setLadeStatus('laedt')
    const naechsterTag = alsIsoDatum(addTage(parseIso(datum), 1))
    const [{ data: pData }, { data: eData }, { data: mData }] = await Promise.all([
      supabase.from('projekte').select('id, name, status'),
      supabase
        .from('bautagebuch_eintraege')
        .select('id, projekt_id, wetter, temperatur_grad, taetigkeiten, besonderheiten, kunde_anwesend, gewerke(name)')
        .eq('datum', datum)
        .order('erstellt_am', { ascending: false }),
      supabase
        .from('maengel')
        .select('id, titel, dringlichkeit, projekt_id')
        .gte('erstellt_am', datum)
        .lt('erstellt_am', naechsterTag),
    ])
    setProjekte((pData ?? []) as ProjektZeile[])
    setEintraege((eData ?? []) as unknown as Eintrag[])
    setMaengel((mData ?? []) as Mangel[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [datum])

  const projektName = (id: string) => projekte.find((p) => p.id === id)?.name ?? 'Unbekanntes Projekt'
  const istHeute = datum === heuteIso

  const aktiveProjekte = projekte.filter((p) => p.status === 'ausfuehrung')
  const projekteMitBerichtIds = new Set(eintraege.map((e) => e.projekt_id))
  const projekteOhneBericht = aktiveProjekte.filter((p) => !projekteMitBerichtIds.has(p.id))
  const kritischeMaengel = maengel.filter((m) => m.dringlichkeit === 'kritisch')

  const heroText = useMemo(() => {
    const tagWort = istHeute ? 'heute' : 'an diesem Tag'
    if (aktiveProjekte.length === 0) {
      return { titel: 'Keine Projekte in Ausführung.', subtitel: 'Sobald ein Projekt in der Ausführung ist, erscheinen hier die Tagesberichte.' }
    }
    if (projekteOhneBericht.length === 0) {
      return {
        titel: `Alle Projekte haben ${tagWort} berichtet.`,
        subtitel: `${maengel.length} neue Mängel${kritischeMaengel.length > 0 ? ` (${kritischeMaengel.length} kritisch)` : ''} gemeldet.`,
      }
    }
    const n = projekteOhneBericht.length
    return {
      titel: `${n} von ${aktiveProjekte.length} Projekten ohne Bericht ${tagWort}.`,
      subtitel: `${eintraege.length} Bautagebuch-Einträge, ${maengel.length} neue Mängel${kritischeMaengel.length > 0 ? ` (${kritischeMaengel.length} kritisch)` : ''}.`,
    }
  }, [istHeute, aktiveProjekte.length, projekteOhneBericht.length, eintraege.length, maengel.length, kritischeMaengel.length])

  return (
    <AppShell title="Tagesbericht" subtitle={aktivFirma?.name} wide>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <button style={knopfSekundaerStil} onClick={() => setDatum((d) => alsIsoDatum(addTage(parseIso(d), -1)))}>‹ Vorheriger Tag</button>
        <input
          type="date"
          value={datum}
          max={heuteIso}
          onChange={(e) => e.target.value && setDatum(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 13, border: '1px solid var(--glass-border)', fontSize: 12.5, background: 'rgba(255,255,255,.5)', color: 'var(--ink)' }}
        />
        <button style={knopfSekundaerStil} disabled={istHeute} onClick={() => setDatum((d) => alsIsoDatum(addTage(parseIso(d), 1)))}>Nächster Tag ›</button>
        {!istHeute && <button style={knopfSekundaerStil} onClick={() => setDatum(heuteIso)}>Heute</button>}
      </div>

      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ ...karteStil, padding: '30px 36px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ color: 'var(--orange-deep)', flexShrink: 0, marginTop: 2 }}>
                <BuchIcon />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {datumLabel(datum, heuteIso)}
                </div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 2.4vw, 32px)', fontWeight: 700, margin: '6px 0 0', letterSpacing: '-0.02em' }}>
                  {heroText.titel}
                </h1>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-dim)', maxWidth: 480 }}>{heroText.subtitel}</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {eintraege.length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>Berichte</div>
              </div>
              <div style={{ textAlign: 'right', borderLeft: '1px solid var(--glass-border)', paddingLeft: 24 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                    color: projekteOhneBericht.length > 0 ? 'var(--orange-text)' : 'inherit',
                  }}
                >
                  {projekteOhneBericht.length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>Ohne Bericht</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            <Stat label="Berichte" value={String(eintraege.length)} />
            <Stat label="Projekte ohne Bericht" value={String(projekteOhneBericht.length)} warnend={projekteOhneBericht.length > 0} />
            <Stat label="Neue Mängel" value={String(maengel.length)} />
            <Stat label="Davon kritisch" value={String(kritischeMaengel.length)} warnend={kritischeMaengel.length > 0} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 20, marginBottom: 24 }}>
            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Berichte des Tages</h2>
              {eintraege.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Kein Bautagebuch-Eintrag {istHeute ? 'heute' : 'an diesem Tag'}.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {eintraege.map((e) => (
                    <Link
                      key={e.id}
                      to={`/projekte/${e.projekt_id}?tab=bautagebuch`}
                      style={{ display: 'block', padding: '10px 12px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{projektName(e.projekt_id)}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {e.gewerke?.name && <span style={pillStil('neutral')}>{e.gewerke.name}</span>}
                          {e.kunde_anwesend && <span style={pillStil('ok')}>Kunde vor Ort</span>}
                        </div>
                      </div>
                      {(e.wetter || e.temperatur_grad !== null) && (
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>
                          {e.wetter ?? ''}{e.wetter && e.temperatur_grad !== null ? ' · ' : ''}{e.temperatur_grad !== null ? `${e.temperatur_grad}°C` : ''}
                        </div>
                      )}
                      {e.taetigkeiten && (
                        <div style={{ fontSize: 12.5, color: 'var(--ink-dim)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {e.taetigkeiten}
                        </div>
                      )}
                      {e.besonderheiten && (
                        <div style={{ fontSize: 12, color: 'var(--orange-text)', marginTop: 4 }}>⚠ {e.besonderheiten}</div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Projekte ohne Bericht</h2>
              {aktiveProjekte.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Aktuell kein Projekt in Ausführung.</p>
              ) : projekteOhneBericht.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Alle Projekte in Ausführung haben berichtet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {projekteOhneBericht.map((p) => (
                    <Link
                      key={p.id}
                      to={`/projekte/${p.id}?tab=bautagebuch`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</span>
                      <span style={pillStil('warn')}>Kein Eintrag</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={karteStil}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>
              Neue Mängel {istHeute ? 'heute' : 'an diesem Tag'}
            </h2>
            {maengel.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Keine neuen Mängel gemeldet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {maengel.map((m) => (
                  <Link
                    key={m.id}
                    to={`/projekte/${m.projekt_id}?tab=maengel`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.titel}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{projektName(m.projekt_id)}</div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: dringlichkeitFarbe[m.dringlichkeit], whiteSpace: 'nowrap' }}>
                      {m.dringlichkeit.toUpperCase()}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <p className="footnote">
            Berichte kommen aus dem Reiter „Bautagebuch" je Projekt, Mängel aus dem Reiter „Mängel". Eine KI-gestützte
            Textzusammenfassung über alle Projekte hinweg sowie die Einbindung der Kommunikation (sobald das Modul
            „Kommunikation" existiert) sind als nächste Ausbaustufe vorgesehen.
          </p>
        </>
      )}
    </AppShell>
  )
}

function Stat({ label, value, warnend }: { label: string; value: string; warnend?: boolean }) {
  return (
    <div className="stat liquid" style={{ padding: '18px 20px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4, color: warnend ? 'var(--red)' : 'inherit' }}>{value}</div>
    </div>
  )
}
