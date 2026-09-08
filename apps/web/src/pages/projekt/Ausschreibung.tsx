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

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const statusLabel: Record<LvStatus, string> = { offen: 'Offen', angefragt: 'Angefragt', entfallen: 'Entfallen' }
const statusVariante: Record<LvStatus, 'ok' | 'warn' | 'bad' | 'neutral'> = { offen: 'neutral', angefragt: 'warn', entfallen: 'bad' }

function positionsSumme(p: LvPosition) {
  if (p.einzelpreis_cents == null) return null
  return Math.round((p.menge ?? 1) * p.einzelpreis_cents)
}

export default function Ausschreibung({ projektId }: { projektId: string }) {
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
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Position'}
        </button>
      </div>

      {zeigeFormular && (
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
