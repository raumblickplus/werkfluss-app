import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { karteStil, eingabeStil, knopfStil } from './stil'

type Gewerk = { id: string; name: string; sortierung: number }
type Position = {
  id: string
  gewerk_id: string | null
  kurztext: string
  einheit: string | null
  einzelpreis_cents: number
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

// Wiederverwendbare Preisliste je Firma (Konzept Abschnitt 16, Phase 2:
// "Preiskatalog + automatische Angebotserstellung"). Einmal gepflegt,
// lässt sich daraus im Tab "Angebote & Aufträge" eines Projekts ein
// Angebot automatisch aus dem Leistungsverzeichnis erzeugen, statt jede
// Ausschreibung erneut von Hand durchzupreisen.
export default function Preiskatalog() {
  const { aktivFirma } = useAuth()
  const [positionen, setPositionen] = useState<Position[]>([])
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [gewerkId, setGewerkId] = useState('')
  const [kurztext, setKurztext] = useState('')
  const [einheit, setEinheit] = useState('')
  const [einzelpreisEuro, setEinzelpreisEuro] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function laden() {
    if (!aktivFirma) return
    setLadeStatus('laedt')
    const [{ data: posData, error }, { data: gewerkeData }] = await Promise.all([
      supabase
        .from('preiskatalog_positionen')
        .select('id, gewerk_id, kurztext, einheit, einzelpreis_cents')
        .eq('firma_id', aktivFirma.id)
        .order('kurztext'),
      supabase.from('gewerke').select('id, name, sortierung').order('sortierung'),
    ])
    if (error) { setLadeStatus('fehler'); return }
    setPositionen((posData ?? []) as Position[])
    setGewerke((gewerkeData ?? []) as Gewerk[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [aktivFirma?.id])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma || !kurztext.trim()) return
    const einzelpreisCents = Math.round(parseFloat(einzelpreisEuro.replace(',', '.')) * 100)
    if (Number.isNaN(einzelpreisCents)) { setFehler('Bitte einen gültigen Preis angeben.'); return }
    setSpeichert(true)
    setFehler(null)
    const { error } = await supabase.from('preiskatalog_positionen').insert({
      firma_id: aktivFirma.id,
      gewerk_id: gewerkId || null,
      kurztext: kurztext.trim(),
      einheit: einheit.trim() || null,
      einzelpreis_cents: einzelpreisCents,
    })
    setSpeichert(false)
    if (error) { setFehler('Konnte nicht gespeichert werden.'); return }
    setGewerkId(''); setKurztext(''); setEinheit(''); setEinzelpreisEuro('')
    setZeigeFormular(false)
    laden()
  }

  async function loeschen(p: Position) {
    if (!confirm(`Position „${p.kurztext}" wirklich aus dem Preiskatalog entfernen?`)) return
    setPositionen((prev) => prev.filter((x) => x.id !== p.id))
    await supabase.from('preiskatalog_positionen').delete().eq('id', p.id)
  }

  const sektionen = useMemo(() => {
    const gruppen = new Map<string, Position[]>()
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)', maxWidth: 480 }}>
          Eigene Standardpreise je Leistung. Beim Erstellen eines Angebots aus dem Leistungsverzeichnis eines
          Projekts werden offene Positionen automatisch anhand des Kurztexts gegen diesen Katalog abgeglichen.
        </p>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Position'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '2 1 260px' }}>
              Kurztext
              <input
                style={eingabeStil}
                value={kurztext}
                onChange={(e) => setKurztext(e.target.value)}
                placeholder="z. B. Fenster liefern und einbauen"
                required
              />
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 140px' }}>
              Einheit
              <input style={eingabeStil} value={einheit} onChange={(e) => setEinheit(e.target.value)} placeholder="z. B. m²" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Standard-Einzelpreis (€)
              <input
                style={eingabeStil}
                value={einzelpreisEuro}
                onChange={(e) => setEinzelpreisEuro(e.target.value)}
                placeholder="z. B. 450"
                required
              />
            </label>
          </div>
          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
          <div>
            <button type="submit" style={knopfStil} disabled={speichert || !kurztext.trim()}>
              {speichert ? 'Speichert …' : 'Position speichern'}
            </button>
          </div>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Preiskatalog konnte nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && positionen.length === 0 && (
        <div style={karteStil}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
            Noch kein Preiskatalog angelegt. Trage die Leistungen und Preise ein, die bei euch am häufigsten
            vorkommen – sie stehen dann bei jedem passenden Projekt automatisch zur Verfügung.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {sektionen.map((sektion) => (
          <div key={sektion.titel}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              {sektion.titel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sektion.positionen.map((p) => (
                <div key={p.id} style={{ ...karteStil, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 220px', fontSize: 13.5, fontWeight: 700 }}>{p.kurztext}</span>
                  {p.einheit && <span style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>je {p.einheit}</span>}
                  <span style={{ fontSize: 12.5, color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
                    {euro.format(p.einzelpreis_cents / 100)}
                  </span>
                  <button
                    onClick={() => loeschen(p)}
                    title="Entfernen"
                    style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--ink-faint)', padding: '0 4px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
