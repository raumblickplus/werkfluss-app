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

type OffenesAngebot = { id: string; projekt_id: string; gewerk: string | null; summe_netto_cents: number; firmen: { name: string } | { name: string }[] | null }
type FaelligeAufgabe = { id: string; projekt_id: string; titel: string; faellig_am: string }
type FristMangel = { id: string; projekt_id: string; titel: string; frist: string; dringlichkeit: Mangel['dringlichkeit'] }
type KiHinweis = {
  id: string
  gewerk: string | null
  erstellt_am: string
  ergebnis: { beobachtungen: { aussage: string; einstufung: string }[] }
  bautagebuch_eintraege: { projekt_id: string } | { projekt_id: string }[] | null
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

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

  const [offeneAngebote, setOffeneAngebote] = useState<OffenesAngebot[]>([])
  const [faelligeAufgaben, setFaelligeAufgaben] = useState<FaelligeAufgabe[]>([])
  const [fristMaengel, setFristMaengel] = useState<FristMangel[]>([])
  const [kiHinweise, setKiHinweise] = useState<KiHinweis[]>([])
  const [aufmerksamkeitStatus, setAufmerksamkeitStatus] = useState<'laedt' | 'bereit'>('laedt')

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

  // Gebündelte "Braucht Aufmerksamkeit"-Übersicht (Konzept Abschnitt 8.17,
  // Informationsflut-Management): offene Freigaben, fällige Aufgaben, Mängel
  // mit naher Frist und KI-Hinweise aus der Fotoerkennung an einem Ort,
  // statt verstreut über die einzelnen Projekt-Tabs. Unabhängig vom oben
  // gewählten Tag, da das der aktuelle Stand ist, nicht ein Tagesrückblick.
  useEffect(() => {
    async function aufmerksamkeitLaden() {
      setAufmerksamkeitStatus('laedt')
      const in3TagenIso = alsIsoDatum(addTage(new Date(), 3))
      const [{ data: angeboteData }, { data: aufgabenData }, { data: maengelFristData }, { data: kiData }] = await Promise.all([
        supabase.from('angebote').select('id, projekt_id, gewerk, summe_netto_cents, firmen(name)').eq('status', 'versendet'),
        supabase
          .from('aufgaben')
          .select('id, projekt_id, titel, faellig_am')
          .lte('faellig_am', heuteIso)
          .not('faellig_am', 'is', null)
          .neq('status', 'erledigt'),
        supabase
          .from('maengel')
          .select('id, projekt_id, titel, frist, dringlichkeit')
          .lte('frist', in3TagenIso)
          .not('frist', 'is', null)
          .not('status', 'in', '(behoben,abgenommen)'),
        supabase
          .from('foto_ki_einschaetzungen')
          .select('id, gewerk, erstellt_am, ergebnis, bautagebuch_eintraege(projekt_id)')
          .order('erstellt_am', { ascending: false })
          .limit(30),
      ])
      setOffeneAngebote((angeboteData ?? []) as unknown as OffenesAngebot[])
      setFaelligeAufgaben((aufgabenData ?? []) as FaelligeAufgabe[])
      setFristMaengel((maengelFristData ?? []) as FristMangel[])
      const alleKiHinweise = (kiData ?? []) as unknown as KiHinweis[]
      setKiHinweise(alleKiHinweise.filter((k) => k.ergebnis?.beobachtungen?.some((b) => b.einstufung === 'moeglicher_mangel')).slice(0, 8))
      setAufmerksamkeitStatus('bereit')
    }
    aufmerksamkeitLaden()
  }, [heuteIso])

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

      <div style={{ ...karteStil, marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 4px' }}>Braucht Aufmerksamkeit</h2>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--ink-faint)' }}>
          Gebündelt statt einzeln über alle Projekte verteilt – aktueller Stand, unabhängig vom oben gewählten Tag.
        </p>
        {aufmerksamkeitStatus === 'laedt' ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Lädt …</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)', marginBottom: 8 }}>
                Offene Freigaben ({offeneAngebote.length})
              </div>
              {offeneAngebote.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>Keine versendeten Angebote warten auf Entscheidung.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {offeneAngebote.map((a) => {
                    const firma = Array.isArray(a.firmen) ? a.firmen[0]?.name : a.firmen?.name
                    return (
                      <Link key={a.id} to={`/projekte/${a.projekt_id}?tab=angebote`} style={{ display: 'block', padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{projektName(a.projekt_id)}{a.gewerk ? ` · ${a.gewerk}` : ''}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{firma ?? 'Unbekannte Firma'} · {euro.format(a.summe_netto_cents / 100)} netto</div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)', marginBottom: 8 }}>
                Fällige Aufgaben ({faelligeAufgaben.length})
              </div>
              {faelligeAufgaben.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>Keine überfälligen oder heute fälligen Aufgaben.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {faelligeAufgaben.map((a) => (
                    <Link key={a.id} to={`/projekte/${a.projekt_id}?tab=aufgaben`} style={{ display: 'block', padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.titel}</div>
                      <div style={{ fontSize: 11, color: a.faellig_am < heuteIso ? 'var(--red)' : 'var(--ink-faint)' }}>
                        {projektName(a.projekt_id)} · fällig {new Date(a.faellig_am).toLocaleDateString('de-DE')}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)', marginBottom: 8 }}>
                Mängel mit naher Frist ({fristMaengel.length})
              </div>
              {fristMaengel.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>Keine Mängel mit Frist in den nächsten 3 Tagen.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fristMaengel.map((m) => (
                    <Link key={m.id} to={`/projekte/${m.projekt_id}?tab=maengel`} style={{ display: 'block', padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.titel}</div>
                      <div style={{ fontSize: 11, color: m.frist < heuteIso ? 'var(--red)' : 'var(--ink-faint)' }}>
                        {projektName(m.projekt_id)} · Frist {new Date(m.frist).toLocaleDateString('de-DE')}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)', marginBottom: 8 }}>
                KI-Hinweise aus Fotos ({kiHinweise.length})
              </div>
              {kiHinweise.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>Keine offenen KI-Hinweise auf mögliche Mängel.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {kiHinweise.map((k) => {
                    const btEintrag = Array.isArray(k.bautagebuch_eintraege) ? k.bautagebuch_eintraege[0] : k.bautagebuch_eintraege
                    const beobachtung = k.ergebnis.beobachtungen.find((b) => b.einstufung === 'moeglicher_mangel')
                    if (!btEintrag) return null
                    return (
                      <Link key={k.id} to={`/projekte/${btEintrag.projekt_id}?tab=bautagebuch`} style={{ display: 'block', padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{projektName(btEintrag.projekt_id)}{k.gewerk ? ` · ${k.gewerk}` : ''}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {beobachtung?.aussage}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 2 }}>Unverbindliche KI-Ersteinschätzung</div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 14 }}>
              <div className="block olive-deep" style={{ gridColumn: 'span 7', minWidth: 260 }}>
                <div className="block-ticks" />
                <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BuchIcon groesse={14} />
                  {datumLabel(datum, heuteIso)}
                </div>
                <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{eintraege.length}</div>
                <div className="block-sub">{heroText.titel}</div>
              </div>
              <div className={`block ${projekteOhneBericht.length > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 5', minWidth: 220 }}>
                <div className="block-lbl">Ohne Bericht</div>
                <div className="block-num" style={{ fontSize: 'clamp(30px, 3.2vw, 48px)' }}>{projekteOhneBericht.length}</div>
                <div className="block-sub">{heroText.subtitel}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 24 }}>
              <div className="block mustard" style={{ gridColumn: 'span 3', minWidth: 160 }}>
                <div className="block-lbl">Berichte</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(eintraege.length)}</div>
              </div>
              <div className="block olive" style={{ gridColumn: 'span 3', minWidth: 160 }}>
                <div className="block-lbl">Ohne Bericht</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(projekteOhneBericht.length)}</div>
              </div>
              <div className="block cream" style={{ gridColumn: 'span 3', minWidth: 160 }}>
                <div className="block-lbl">Neue Mängel</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(maengel.length)}</div>
              </div>
              <div className="block dark" style={{ gridColumn: 'span 3', minWidth: 160 }}>
                <div className="block-lbl">Davon kritisch</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(kritischeMaengel.length)}</div>
              </div>
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
