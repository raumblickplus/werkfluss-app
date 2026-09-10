import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { karteStil, eingabeStil, knopfStil, pillStil } from './stil'

type Gewerk = { id: string; name: string; sortierung: number }
type Artikel = {
  id: string
  gewerk_id: string | null
  bezeichnung: string
  einheit: string | null
  bestand: number
  mindestbestand: number | null
  notiz: string | null
}

// Eigener Lagerbestand je Firma (Konzept Abschnitt 8.15). Bewusst nur die
// eigene Bestandsliste mit Mindestbestand-Warnung - eine Anbindung an
// Lieferanten/Großhändler (Bestand, Preis, Lieferzeit) ist hier nicht Teil
// der Umsetzung, dafür bräuchte es eine echte Partnerintegration je
// Großhändler statt einer pauschalen Lösung.
export default function Lager() {
  const { aktivFirma } = useAuth()
  const [artikel, setArtikel] = useState<Artikel[]>([])
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [gewerkId, setGewerkId] = useState('')
  const [bezeichnung, setBezeichnung] = useState('')
  const [einheit, setEinheit] = useState('')
  const [bestand, setBestand] = useState('')
  const [mindestbestand, setMindestbestand] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function laden() {
    if (!aktivFirma) return
    setLadeStatus('laedt')
    const [{ data: artikelData, error }, { data: gewerkeData }] = await Promise.all([
      supabase
        .from('lager_artikel')
        .select('id, gewerk_id, bezeichnung, einheit, bestand, mindestbestand, notiz')
        .eq('firma_id', aktivFirma.id)
        .order('bezeichnung'),
      supabase.from('gewerke').select('id, name, sortierung').order('sortierung'),
    ])
    if (error) { setLadeStatus('fehler'); return }
    setArtikel((artikelData ?? []) as Artikel[])
    setGewerke((gewerkeData ?? []) as Gewerk[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [aktivFirma?.id])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma || !bezeichnung.trim()) return
    const bestandNum = parseFloat(bestand.replace(',', '.')) || 0
    const mindestNum = mindestbestand.trim() ? parseFloat(mindestbestand.replace(',', '.')) : null
    if (mindestNum !== null && Number.isNaN(mindestNum)) { setFehler('Ungültiger Mindestbestand.'); return }
    setSpeichert(true)
    setFehler(null)
    const { error } = await supabase.from('lager_artikel').insert({
      firma_id: aktivFirma.id,
      gewerk_id: gewerkId || null,
      bezeichnung: bezeichnung.trim(),
      einheit: einheit.trim() || null,
      bestand: bestandNum,
      mindestbestand: mindestNum,
    })
    setSpeichert(false)
    if (error) { setFehler('Konnte nicht gespeichert werden.'); return }
    setGewerkId(''); setBezeichnung(''); setEinheit(''); setBestand(''); setMindestbestand('')
    setZeigeFormular(false)
    laden()
  }

  async function bestandAktualisieren(a: Artikel, neuerWert: string) {
    const num = parseFloat(neuerWert.replace(',', '.'))
    if (Number.isNaN(num)) return
    setArtikel((prev) => prev.map((x) => (x.id === a.id ? { ...x, bestand: num } : x)))
    await supabase.from('lager_artikel').update({ bestand: num }).eq('id', a.id)
  }

  async function loeschen(a: Artikel) {
    if (!confirm(`Artikel „${a.bezeichnung}" wirklich aus dem Lager entfernen?`)) return
    setArtikel((prev) => prev.filter((x) => x.id !== a.id))
    await supabase.from('lager_artikel').delete().eq('id', a.id)
  }

  const sektionen = useMemo(() => {
    const gruppen = new Map<string, Artikel[]>()
    for (const a of artikel) {
      const key = a.gewerk_id ?? '__ohne__'
      if (!gruppen.has(key)) gruppen.set(key, [])
      gruppen.get(key)!.push(a)
    }
    const geordnet = gewerke
      .filter((g) => gruppen.has(g.id))
      .map((g) => ({ titel: g.name, artikel: gruppen.get(g.id)! }))
    if (gruppen.has('__ohne__')) {
      geordnet.push({ titel: 'Ohne Gewerk', artikel: gruppen.get('__ohne__')! })
    }
    return geordnet
  }, [artikel, gewerke])

  const niedrigeBestaende = artikel.filter((a) => a.mindestbestand != null && a.bestand < a.mindestbestand).length

  // Gleiches Rechtemodell wie beim Preiskatalog: pflegen dürfen Inhaber,
  // Geschäftsführung und die Rolle Einkauf, sehen dürfen alle.
  const darfBearbeiten = !!aktivFirma && ['inhaber', 'geschaeftsfuehrung', 'einkauf'].includes(aktivFirma.rolle)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)', maxWidth: 480 }}>
          Euer eigener Materialbestand. {niedrigeBestaende > 0 && (
            <strong style={{ color: 'var(--orange-text)' }}>{niedrigeBestaende} Artikel unter Mindestbestand.</strong>
          )}
        </p>
        {darfBearbeiten && (
          <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
            {zeigeFormular ? 'Abbrechen' : '+ Artikel'}
          </button>
        )}
      </div>

      {darfBearbeiten && zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '2 1 260px' }}>
              Bezeichnung
              <input style={eingabeStil} value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Trockenbauschrauben 3,5×35" required />
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
              Einheit
              <input style={eingabeStil} value={einheit} onChange={(e) => setEinheit(e.target.value)} placeholder="z. B. Stk, m²" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 140px' }}>
              Bestand
              <input style={eingabeStil} value={bestand} onChange={(e) => setBestand(e.target.value)} placeholder="z. B. 200" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Mindestbestand (optional)
              <input style={eingabeStil} value={mindestbestand} onChange={(e) => setMindestbestand(e.target.value)} placeholder="z. B. 50" />
            </label>
          </div>
          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
          <div>
            <button type="submit" style={knopfStil} disabled={speichert || !bezeichnung.trim()}>
              {speichert ? 'Speichert …' : 'Artikel speichern'}
            </button>
          </div>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Lagerbestand konnte nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && artikel.length === 0 && (
        <div style={karteStil}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
            Noch kein Lagerbestand angelegt. Trage die Artikel ein, die ihr üblicherweise vorrätig habt – mit
            Mindestbestand seht ihr auf einen Blick, was nachbestellt werden muss.
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
              {sektion.artikel.map((a) => {
                const niedrig = a.mindestbestand != null && a.bestand < a.mindestbestand
                return (
                  <div key={a.id} style={{ ...karteStil, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ flex: '1 1 220px', fontSize: 13.5, fontWeight: 700 }}>{a.bezeichnung}</span>
                    {darfBearbeiten ? (
                      <input
                        style={{ ...eingabeStil, width: 90, padding: '6px 8px', textAlign: 'right' }}
                        defaultValue={String(a.bestand)}
                        onBlur={(e) => bestandAktualisieren(a, e.target.value)}
                      />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{a.bestand}</span>
                    )}
                    {a.einheit && <span style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>{a.einheit}</span>}
                    {a.mindestbestand != null && (
                      <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>Mindest: {a.mindestbestand}</span>
                    )}
                    {niedrig && <span style={pillStil('warn')}>Nachbestellen</span>}
                    {darfBearbeiten && (
                      <button
                        onClick={() => loeschen(a)}
                        title="Entfernen"
                        style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--ink-faint)', padding: '0 4px' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="footnote">
        Nur der eigene Bestand – eine Anbindung an Lieferanten/Großhändler (Bestand, Preis, Lieferzeit beim
        Händler) ist bewusst nicht Teil dieser Umsetzung, dafür bräuchte es eine echte Partnerintegration.
      </p>
    </div>
  )
}
