import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import Marke from '../components/Marke'
import Kommunikation from './projekt/Kommunikation'
import { karteStil, eingabeStil, knopfStil, knopfSekundaerStil, pillStil, projektStatusLabel, projektStatusVariante } from './stil'

type Tab = 'kommunikation' | 'bautagebuch' | 'maengel' | 'projektmappe' | 'planung'

const tabs: { key: Tab; label: string }[] = [
  { key: 'planung', label: 'Planung & Status' },
  { key: 'bautagebuch', label: 'Bautagebuch' },
  { key: 'maengel', label: 'Mängel' },
  { key: 'projektmappe', label: 'Projektmappe' },
  { key: 'kommunikation', label: 'Kommunikation' },
]

type ProjektDetails = {
  id: string
  name: string
  adresse: string | null
  status: string
  vorhabenart: string | null
  gebaeudeklasse: string | null
  start_datum: string | null
  end_datum_geplant: string | null
  planungsnotiz: string | null
}

const vorhabenartLabel: Record<string, string> = { neubau: 'Neubau', sanierung: 'Sanierung', anbau: 'Anbau' }

// Eigenständige, vereinfachte Ansicht für Bauherr:innen ohne eigene Firma
// (Konzept: "Transparenz, einfache Freigaben, ein Ansprechpartner statt
// vieler Einzelkontakte", Abschnitt 4). Bewusst kein <AppShell> - das ist
// die volle Profi-Oberfläche mit Modulen, die für einen privaten Bauherrn
// nichts bedeuten (Finanzen, Preiskatalog, Ausschreibung, Team-Verwaltung
// etc.). Stattdessen eine schlanke eigene Navigation mit genau den fünf
// Bereichen, die für den Bauherrn relevant sind.
export default function Kundenansicht() {
  const { bauherrProjekte, signOut } = useAuth()
  const [projektId, setProjektId] = useState<string | null>(null)
  const [projekt, setProjekt] = useState<ProjektDetails | null>(null)
  const [aktivTab, setAktivTab] = useState<Tab>('planung')

  useEffect(() => {
    if (!projektId && bauherrProjekte.length > 0) setProjektId(bauherrProjekte[0].id)
  }, [bauherrProjekte, projektId])

  useEffect(() => {
    if (!projektId) { setProjekt(null); return }
    supabase
      .from('projekte')
      .select('id, name, adresse, status, vorhabenart, gebaeudeklasse, start_datum, end_datum_geplant, planungsnotiz')
      .eq('id', projektId)
      .maybeSingle()
      .then(({ data }) => setProjekt((data as ProjektDetails) ?? null))
  }, [projektId])

  if (bauherrProjekte.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ ...karteStil, maxWidth: 420, textAlign: 'center' }}>
          <p style={{ margin: 0 }}>Du bist noch zu keinem Projekt eingeladen.</p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-faint)' }}>
            Sobald dich dein Bauunternehmen, Architekturbüro oder Handwerksbetrieb über einen Einladungslink hinzufügt, taucht es hier auf.
          </p>
          <button style={{ ...knopfSekundaerStil, marginTop: 16 }} onClick={() => signOut()}>Abmelden</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--linie, rgba(0,0,0,.08))', flexWrap: 'wrap', gap: 12 }}>
        <Marke mitWort groesse={30} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {bauherrProjekte.length > 1 ? (
            <select style={eingabeStil} value={projektId ?? ''} onChange={(e) => setProjektId(e.target.value)}>
              {bauherrProjekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{projekt?.name ?? bauherrProjekte[0]?.name}</span>
          )}
          <button style={knopfSekundaerStil} onClick={() => signOut()}>Abmelden</button>
        </div>
      </div>

      <div className="tabs" style={{ padding: '14px 24px 0' }}>
        {tabs.map((t) => (
          <button key={t.key} className={`tab${aktivTab === t.key ? ' active' : ''}`} onClick={() => setAktivTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 24px 40px', flex: 1, maxWidth: 860, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {projektId && aktivTab === 'planung' && <PlanungStatus projekt={projekt} />}
        {projektId && aktivTab === 'bautagebuch' && <BautagebuchLesend projektId={projektId} />}
        {projektId && aktivTab === 'maengel' && <MaengelMelden projektId={projektId} />}
        {projektId && aktivTab === 'projektmappe' && <ProjektmappeLesend projektId={projektId} />}
        {projektId && aktivTab === 'kommunikation' && <Kommunikation projektId={projektId} />}
      </div>
    </div>
  )
}

function PlanungStatus({ projekt }: { projekt: ProjektDetails | null }) {
  if (!projekt) return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...karteStil, display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)' }}>Status</div>
          <span style={{ ...pillStil(projektStatusVariante[projekt.status] ?? 'neutral'), marginTop: 6, display: 'inline-block' }}>
            {projektStatusLabel[projekt.status] ?? projekt.status}
          </span>
        </div>
        {projekt.vorhabenart && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)' }}>Vorhaben</div>
            <div style={{ fontSize: 13.5, marginTop: 4 }}>{vorhabenartLabel[projekt.vorhabenart] ?? projekt.vorhabenart}</div>
          </div>
        )}
        {projekt.adresse && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)' }}>Adresse</div>
            <div style={{ fontSize: 13.5, marginTop: 4 }}>{projekt.adresse}</div>
          </div>
        )}
        {(projekt.start_datum || projekt.end_datum_geplant) && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)' }}>Zeitraum</div>
            <div style={{ fontSize: 13.5, marginTop: 4 }}>
              {projekt.start_datum ? new Date(projekt.start_datum).toLocaleDateString('de-DE') : '–'}
              {' – '}
              {projekt.end_datum_geplant ? new Date(projekt.end_datum_geplant).toLocaleDateString('de-DE') : 'offen'}
            </div>
          </div>
        )}
      </div>
      <div style={karteStil}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)', marginBottom: 8 }}>
          Aktueller Planungsstand
        </div>
        {projekt.planungsnotiz ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{projekt.planungsnotiz}</p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
            Hier trägt dein Ansprechpartner ein, wo die Planung gerade steht – bisher noch kein Eintrag.
          </p>
        )}
      </div>
    </div>
  )
}

type BautagebuchEintrag = {
  id: string
  titel: string
  text: string | null
  gewerk: string | null
  erstellt_am: string
  fotos: { url: string }[] | null
}

function BautagebuchLesend({ projektId }: { projektId: string }) {
  const [eintraege, setEintraege] = useState<BautagebuchEintrag[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  useEffect(() => {
    setLadeStatus('laedt')
    supabase
      .from('bautagebuch_eintraege')
      .select('id, titel, text, gewerk, erstellt_am, fotos')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: false })
      .then(({ data }) => {
        setEintraege((data ?? []) as BautagebuchEintrag[])
        setLadeStatus('bereit')
      })
  }, [projektId])

  if (ladeStatus === 'laedt') return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
  if (eintraege.length === 0) return <p style={{ color: 'var(--ink-faint)' }}>Noch keine Einträge im Bautagebuch.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {eintraege.map((e) => (
        <div key={e.id} style={karteStil}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{e.titel}{e.gewerk ? ` · ${e.gewerk}` : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{new Date(e.erstellt_am).toLocaleDateString('de-DE')}</div>
          </div>
          {e.text && <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.5 }}>{e.text}</p>}
          {e.fotos && e.fotos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {e.fotos.map((f, i) => (
                <img key={i} src={f.url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

type Mangel = {
  id: string
  titel: string
  beschreibung: string | null
  dringlichkeit: 'kritisch' | 'mittel' | 'gering'
  status: 'offen' | 'in_bearbeitung' | 'behoben' | 'abgenommen'
  erstellt_am: string
}

const dringlichkeitLabel: Record<Mangel['dringlichkeit'], string> = { kritisch: 'Kritisch', mittel: 'Mittel', gering: 'Gering' }
const statusLabel: Record<Mangel['status'], string> = { offen: 'Offen', in_bearbeitung: 'In Bearbeitung', behoben: 'Behoben', abgenommen: 'Abgenommen' }
const statusVariante: Record<Mangel['status'], 'ok' | 'warn' | 'bad' | 'neutral'> = {
  offen: 'bad', in_bearbeitung: 'warn', behoben: 'ok', abgenommen: 'ok',
}

function MaengelMelden({ projektId }: { projektId: string }) {
  const { session } = useAuth()
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [formOffen, setFormOffen] = useState(false)
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [dringlichkeit, setDringlichkeit] = useState<Mangel['dringlichkeit']>('mittel')
  const [speichert, setSpeichert] = useState(false)

  async function laden() {
    setLadeStatus('laedt')
    const { data } = await supabase
      .from('maengel')
      .select('id, titel, beschreibung, dringlichkeit, status, erstellt_am')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: false })
    setMaengel((data ?? []) as Mangel[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function melden(e: FormEvent) {
    e.preventDefault()
    if (!titel.trim() || !session?.user?.id) return
    setSpeichert(true)
    const { error } = await supabase.from('maengel').insert({
      projekt_id: projektId,
      titel: titel.trim(),
      beschreibung: beschreibung.trim() || null,
      dringlichkeit,
      gemeldet_von: session.user.id,
    })
    setSpeichert(false)
    if (!error) {
      setTitel(''); setBeschreibung(''); setDringlichkeit('mittel')
      setFormOffen(false)
      laden()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setFormOffen((v) => !v)}>{formOffen ? 'Abbrechen' : '+ Mangel melden'}</button>
      </div>
      {formOffen && (
        <form onSubmit={melden} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Was ist das Problem?
            <input style={eingabeStil} value={titel} onChange={(e) => setTitel(e.target.value)} required placeholder="z.B. Riss in der Wand im Bad OG" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Beschreibung (optional)
            <textarea style={{ ...eingabeStil, minHeight: 64, resize: 'vertical' }} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', width: 200 }}>
            Dringlichkeit
            <select style={eingabeStil} value={dringlichkeit} onChange={(e) => setDringlichkeit(e.target.value as Mangel['dringlichkeit'])}>
              <option value="gering">Gering</option>
              <option value="mittel">Mittel</option>
              <option value="kritisch">Kritisch</option>
            </select>
          </label>
          <div><button type="submit" style={knopfStil} disabled={speichert || !titel.trim()}>{speichert ? 'Speichert …' : 'Melden'}</button></div>
        </form>
      )}
      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'bereit' && maengel.length === 0 && <p style={{ color: 'var(--ink-faint)' }}>Noch keine Mängel gemeldet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {maengel.map((m) => (
          <div key={m.id} style={karteStil}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.titel}</div>
                {m.beschreibung && <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 3 }}>{m.beschreibung}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={pillStil('neutral')}>{dringlichkeitLabel[m.dringlichkeit]}</span>
                <span style={pillStil(statusVariante[m.status])}>{statusLabel[m.status]}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type Muster = { id: string; name: string; kategorie: string | null; bild_url: string | null; notiz: string | null }
type HerstellerProdukt = {
  id: string
  name: string
  kategorie: string | null
  bild_url: string | null
  musterbestellbar: boolean
  hersteller: { name: string } | null
}

function ProjektmappeLesend({ projektId }: { projektId: string }) {
  const { session } = useAuth()
  const [muster, setMuster] = useState<Muster[]>([])
  const [katalog, setKatalog] = useState<HerstellerProdukt[]>([])
  const [bestellt, setBestellt] = useState<Set<string>>(new Set())
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  useEffect(() => {
    setLadeStatus('laedt')
    Promise.all([
      supabase
        .from('projektmappe_muster')
        .select('id, name, kategorie, bild_url, notiz')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false }),
      supabase
        .from('hersteller_produkte')
        .select('id, name, kategorie, bild_url, musterbestellbar, hersteller(name)')
        .eq('aktiv', true)
        .order('erstellt_am', { ascending: false }),
    ]).then(([musterRes, katalogRes]) => {
      setMuster((musterRes.data ?? []) as Muster[])
      setKatalog((katalogRes.data ?? []) as unknown as HerstellerProdukt[])
      setLadeStatus('bereit')
    })
  }, [projektId])

  async function musterBestellen(p: HerstellerProdukt) {
    if (!session) return
    setBestellt((prev) => new Set(prev).add(p.id))
    const { error } = await supabase.from('musterbestellungen').insert({
      produkt_id: p.id,
      projekt_id: projektId,
      bestellt_von: session.user.id,
    })
    if (error) {
      setBestellt((prev) => {
        const kopie = new Set(prev)
        kopie.delete(p.id)
        return kopie
      })
    }
  }

  const sektionen = useMemo(() => {
    const gruppen = new Map<string, Muster[]>()
    for (const m of muster) {
      const key = m.kategorie ?? 'Sonstiges'
      if (!gruppen.has(key)) gruppen.set(key, [])
      gruppen.get(key)!.push(m)
    }
    return Array.from(gruppen.entries())
  }, [muster])

  if (ladeStatus === 'laedt') return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {muster.length === 0 ? (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Materialmuster/Moodboard-Einträge für dieses Projekt.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {sektionen.map(([titel, eintraege]) => (
            <div key={titel}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)', marginBottom: 10 }}>
                {titel}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                {eintraege.map((m) => (
                  <div key={m.id} style={{ ...karteStil, padding: 12 }}>
                    {m.bild_url && (
                      <img src={m.bild_url} alt={m.name} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
                    )}
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</div>
                    {m.notiz && <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 3 }}>{m.notiz}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)', marginBottom: 10 }}>
          Herstellerkatalog – kostenfrei Muster bestellen
        </div>
        {katalog.length === 0 ? (
          <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Noch keine Hersteller im Katalog.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {katalog.map((p) => (
              <div key={p.id} style={{ ...karteStil, padding: 12 }}>
                {p.bild_url && (
                  <img src={p.bild_url} alt={p.name} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
                )}
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                {p.hersteller?.name && <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 3 }}>{p.hersteller.name}</div>}
                {p.musterbestellbar && (
                  <button
                    style={{ ...knopfSekundaerStil, width: '100%', marginTop: 8, fontSize: 12 }}
                    disabled={bestellt.has(p.id)}
                    onClick={() => musterBestellen(p)}
                  >
                    {bestellt.has(p.id) ? 'Muster angefragt ✓' : 'Muster bestellen'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
