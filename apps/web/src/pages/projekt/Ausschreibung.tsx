import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil, pillStil } from '../stil'

type Gewerk = { id: string; name: string; sortierung: number }
type LvStatus = 'offen' | 'angefragt' | 'entfallen'
type LvPosition = {
  id: string
  gewerk_id: string | null
  position: number
  kurztext: string
  langtext: string | null
  menge: number | null
  einheit: string | null
  einzelpreis_cents: number | null
  status: LvStatus
}

type LvVorschlag = { kurztext: string; langtext?: string; einheit: string }

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const statusLabel: Record<LvStatus, string> = { offen: 'Offen', angefragt: 'Angefragt', entfallen: 'Entfallen' }
const statusVariante: Record<LvStatus, 'ok' | 'warn' | 'bad' | 'neutral'> = { offen: 'neutral', angefragt: 'warn', entfallen: 'bad' }

function positionsSumme(p: LvPosition) {
  if (p.einzelpreis_cents == null) return null
  return Math.round((p.menge ?? 1) * p.einzelpreis_cents)
}

export default function Ausschreibung({ projektId, istEigentuemer }: { projektId: string; istEigentuemer: boolean }) {
  const [positionen, setPositionen] = useState<LvPosition[]>([])
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [gewerkId, setGewerkId] = useState('')
  const [kurztext, setKurztext] = useState('')
  const [langtext, setLangtext] = useState('')
  const [menge, setMenge] = useState('')
  const [einheit, setEinheit] = useState('')
  const [einzelpreisEuro, setEinzelpreisEuro] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [zeigeVorschlaege, setZeigeVorschlaege] = useState(false)
  const [vorschlagGewerkId, setVorschlagGewerkId] = useState('')
  const [vorschlaegeLaden, setVorschlaegeLaden] = useState(false)
  const [vorschlaege, setVorschlaege] = useState<LvVorschlag[] | null>(null)
  const [ausgewaehlteVorschlaege, setAusgewaehlteVorschlaege] = useState<Set<number>>(new Set())
  const [vorschlaegeFehler, setVorschlaegeFehler] = useState<string | null>(null)
  const [uebernahmeLaeuft, setUebernahmeLaeuft] = useState(false)

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: posData, error }, { data: gewerkeData }] = await Promise.all([
      supabase
        .from('lv_positionen')
        .select('id, gewerk_id, position, kurztext, langtext, menge, einheit, einzelpreis_cents, status')
        .eq('projekt_id', projektId)
        .order('position', { ascending: true }),
      supabase.from('gewerke').select('id, name, sortierung').order('sortierung'),
    ])
    if (error) { setLadeStatus('fehler'); return }
    setPositionen((posData ?? []) as LvPosition[])
    setGewerke((gewerkeData ?? []) as Gewerk[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  function formularZuruecksetzen() {
    setGewerkId(''); setKurztext(''); setLangtext(''); setMenge(''); setEinheit(''); setEinzelpreisEuro(''); setFehler(null)
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (!kurztext.trim()) return
    setSpeichert(true)
    setFehler(null)
    const naechstePosition = positionen.reduce((max, p) => Math.max(max, p.position), 0) + 1
    const einzelpreisCents = einzelpreisEuro.trim()
      ? Math.round(parseFloat(einzelpreisEuro.replace(',', '.')) * 100)
      : null
    const { error } = await supabase.from('lv_positionen').insert({
      projekt_id: projektId,
      gewerk_id: gewerkId || null,
      position: naechstePosition,
      kurztext: kurztext.trim(),
      langtext: langtext.trim() || null,
      menge: menge.trim() ? parseFloat(menge.replace(',', '.')) : null,
      einheit: einheit.trim() || null,
      einzelpreis_cents: einzelpreisCents != null && !Number.isNaN(einzelpreisCents) ? einzelpreisCents : null,
    })
    setSpeichert(false)
    if (error) {
      setFehler('Konnte nicht gespeichert werden.')
      return
    }
    formularZuruecksetzen()
    setZeigeFormular(false)
    laden()
  }

  async function statusSetzen(p: LvPosition, status: LvStatus) {
    setPositionen((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)))
    await supabase.from('lv_positionen').update({ status }).eq('id', p.id)
  }

  async function loeschen(p: LvPosition) {
    if (!confirm(`Position „${p.kurztext}" wirklich löschen?`)) return
    setPositionen((prev) => prev.filter((x) => x.id !== p.id))
    await supabase.from('lv_positionen').delete().eq('id', p.id)
  }

  async function vorschlaegeGenerieren() {
    if (!vorschlagGewerkId) return
    setVorschlaegeLaden(true)
    setVorschlaegeFehler(null)
    setVorschlaege(null)
    const { data, error } = await supabase.functions.invoke('lv-vorschlaege', {
      body: { projektId, gewerkId: vorschlagGewerkId },
    })
    setVorschlaegeLaden(false)
    if (error || data?.fehler) {
      setVorschlaegeFehler('Vorschläge konnten nicht erstellt werden. Sind die Supabase-Secrets korrekt hinterlegt?')
      return
    }
    const liste = (data.vorschlaege ?? []) as LvVorschlag[]
    setVorschlaege(liste)
    setAusgewaehlteVorschlaege(new Set(liste.map((_, i) => i)))
  }

  function vorschlagUmschalten(index: number) {
    setAusgewaehlteVorschlaege((prev) => {
      const naechste = new Set(prev)
      if (naechste.has(index)) naechste.delete(index)
      else naechste.add(index)
      return naechste
    })
  }

  async function vorschlaegeUebernehmen() {
    if (!vorschlaege || ausgewaehlteVorschlaege.size === 0) return
    setUebernahmeLaeuft(true)
    const auszuUebernehmen = vorschlaege.filter((_, i) => ausgewaehlteVorschlaege.has(i))
    let naechstePosition = positionen.reduce((max, p) => Math.max(max, p.position), 0) + 1
    const { error } = await supabase.from('lv_positionen').insert(
      auszuUebernehmen.map((v) => ({
        projekt_id: projektId,
        gewerk_id: vorschlagGewerkId,
        position: naechstePosition++,
        kurztext: v.kurztext,
        langtext: v.langtext || null,
        einheit: v.einheit || null,
      }))
    )
    setUebernahmeLaeuft(false)
    if (error) {
      setVorschlaegeFehler('Übernahme fehlgeschlagen.')
      return
    }
    setVorschlaege(null)
    setZeigeVorschlaege(false)
    setVorschlagGewerkId('')
    laden()
  }

  const sektionen = useMemo(() => {
    const gruppen = new Map<string, LvPosition[]>()
    for (const p of positionen) {
      const key = p.gewerk_id ?? '__ohne__'
      if (!gruppen.has(key)) gruppen.set(key, [])
      gruppen.get(key)!.push(p)
    }
    const geordnet = gewerke
      .filter((g) => gruppen.has(g.id))
      .map((g) => ({ titel: g.name, positionen: gruppen.get(g.id)! }))
    if (gruppen.has('__ohne__')) {
      geordnet.push({ titel: 'Ohne Gewerk', positionen: gruppen.get('__ohne__')! })
    }
    return geordnet
  }, [positionen, gewerke])

  const summeGesamtCents = positionen
    .filter((p) => p.status !== 'entfallen')
    .reduce((summe, p) => summe + (positionsSumme(p) ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>
          {positionen.length === 0
            ? 'Noch keine Positionen'
            : `${positionen.length} Position${positionen.length === 1 ? '' : 'en'} · geschätzt ${euro.format(summeGesamtCents / 100)} netto`}
        </span>
        {istEigentuemer && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{ ...knopfStil, background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
              onClick={() => { setZeigeVorschlaege((v) => !v); setZeigeFormular(false) }}
            >
              {zeigeVorschlaege ? 'Abbrechen' : '✨ KI-Vorschläge je Gewerk'}
            </button>
            <button style={knopfStil} onClick={() => { setZeigeFormular((v) => !v); setZeigeVorschlaege(false) }}>
              {zeigeFormular ? 'Abbrechen' : '+ Position'}
            </button>
          </div>
        )}
      </div>

      {istEigentuemer && zeigeVorschlaege && (
        <div style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
            Wähle ein Gewerk – die KI schlägt typische Positionen dafür vor (angelehnt an übliche Ausschreibungssprache, Mengen trägst du danach selbst ein). Die Vorschläge sind ein Startpunkt, keine geprüfte Ausschreibung.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 220px' }}>
              Gewerk
              <select style={eingabeStil} value={vorschlagGewerkId} onChange={(e) => { setVorschlagGewerkId(e.target.value); setVorschlaege(null) }}>
                <option value="">– Gewerk wählen –</option>
                {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <button style={knopfStil} disabled={!vorschlagGewerkId || vorschlaegeLaden} onClick={vorschlaegeGenerieren}>
              {vorschlaegeLaden ? 'Generiert …' : 'Vorschläge generieren'}
            </button>
          </div>
          {vorschlaegeFehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{vorschlaegeFehler}</p>}
          {vorschlaege && vorschlaege.length === 0 && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>Keine Vorschläge erhalten – versuch es erneut.</p>
          )}
          {vorschlaege && vorschlaege.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {vorschlaege.map((v, i) => (
                  <label
                    key={i}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 10,
                      background: ausgewaehlteVorschlaege.has(i) ? 'var(--surface-2, rgba(99,107,47,.08))' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <input type="checkbox" checked={ausgewaehlteVorschlaege.has(i)} onChange={() => vorschlagUmschalten(i)} style={{ marginTop: 3 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{v.kurztext} <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}>({v.einheit})</span></div>
                      {v.langtext && <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>{v.langtext}</div>}
                    </div>
                  </label>
                ))}
              </div>
              <div>
                <button style={knopfStil} disabled={uebernahmeLaeuft || ausgewaehlteVorschlaege.size === 0} onClick={vorschlaegeUebernehmen}>
                  {uebernahmeLaeuft ? 'Übernimmt …' : `${ausgewaehlteVorschlaege.size} ausgewählte Position${ausgewaehlteVorschlaege.size === 1 ? '' : 'en'} übernehmen`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {istEigentuemer && zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '2 1 260px' }}>
              Kurztext
              <input style={eingabeStil} value={kurztext} onChange={(e) => setKurztext(e.target.value)} placeholder="z. B. Fenster liefern und einbauen" required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 200px' }}>
              Gewerk
              <select style={eingabeStil} value={gewerkId} onChange={(e) => setGewerkId(e.target.value)}>
                <option value="">– kein Gewerk –</option>
                {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 120px' }}>
              Menge
              <input style={eingabeStil} value={menge} onChange={(e) => setMenge(e.target.value)} placeholder="z. B. 12" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 120px' }}>
              Einheit
              <input style={eingabeStil} value={einheit} onChange={(e) => setEinheit(e.target.value)} placeholder="z. B. m²" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Geschätzter Einzelpreis (€, optional)
              <input style={eingabeStil} value={einzelpreisEuro} onChange={(e) => setEinzelpreisEuro(e.target.value)} placeholder="z. B. 450" />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Langtext (optional)
            <textarea
              style={{ ...eingabeStil, minHeight: 56, resize: 'vertical' }}
              value={langtext}
              onChange={(e) => setLangtext(e.target.value)}
              placeholder="Ausführliche Leistungsbeschreibung"
            />
          </label>
          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
          <div>
            <button type="submit" style={knopfStil} disabled={speichert || !kurztext.trim()}>
              {speichert ? 'Speichert …' : 'Position speichern'}
            </button>
          </div>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Leistungsverzeichnis …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Positionen konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && positionen.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Positionen – lege die erste Position für die Ausschreibung an.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {sektionen.map((sektion) => (
          <div key={sektion.titel}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              {sektion.titel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sektion.positionen.map((p) => {
                const summeCents = positionsSumme(p)
                return (
                  <div
                    key={p.id}
                    style={{
                      ...karteStil, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      opacity: p.status === 'entfallen' ? .55 : 1,
                    }}
                  >
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, textDecoration: p.status === 'entfallen' ? 'line-through' : 'none' }}>
                        {p.kurztext}
                      </div>
                      {p.langtext && (
                        <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>{p.langtext}</div>
                      )}
                    </div>
                    {(p.menge != null || p.einheit) && (
                      <span style={{ fontSize: 12.5, color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
                        {p.menge != null ? p.menge : ''} {p.einheit ?? ''}
                      </span>
                    )}
                    {summeCents != null && (
                      <span style={{ fontSize: 12.5, color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
                        {euro.format(summeCents / 100)}
                      </span>
                    )}
                    {istEigentuemer ? (
                      <>
                        <select
                          style={{ ...pillStil(statusVariante[p.status]), border: 'none', cursor: 'pointer' }}
                          value={p.status}
                          onChange={(e) => statusSetzen(p, e.target.value as LvStatus)}
                        >
                          <option value="offen">{statusLabel.offen}</option>
                          <option value="angefragt">{statusLabel.angefragt}</option>
                          <option value="entfallen">{statusLabel.entfallen}</option>
                        </select>
                        <button
                          onClick={() => loeschen(p)}
                          title="Entfernen"
                          style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--ink-faint)', padding: '0 4px' }}
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <span style={pillStil(statusVariante[p.status])}>{statusLabel[p.status]}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
