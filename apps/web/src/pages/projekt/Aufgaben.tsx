import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil, pillStil } from '../stil'

type Aufgabe = {
  id: string
  titel: string
  status: 'offen' | 'in_bearbeitung' | 'erledigt'
  faellig_am: string | null
  gewerk: string | null
}

type Gewerk = { id: string; name: string }
type Standardaufgabe = { id: string; titel: string }

export default function Aufgaben({ projektId }: { projektId: string }) {
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [gewerkId, setGewerkId] = useState('')
  const [standardaufgaben, setStandardaufgaben] = useState<Standardaufgabe[]>([])
  const [ausgewaehlteIds, setAusgewaehlteIds] = useState<Set<string>>(new Set())
  const [titel, setTitel] = useState('')
  const [faelligAm, setFaelligAm] = useState('')
  const [speichert, setSpeichert] = useState(false)

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('aufgaben')
      .select('id, titel, status, faellig_am, gewerk')
      .eq('projekt_id', projektId)
      .order('faellig_am', { ascending: true, nullsFirst: false })

    if (error) { setLadeStatus('fehler'); return }
    setAufgaben(data ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  useEffect(() => {
    supabase.from('gewerke').select('id, name').order('sortierung').then(({ data }) => setGewerke(data ?? []))
  }, [])

  useEffect(() => {
    if (!gewerkId) { setStandardaufgaben([]); setAusgewaehlteIds(new Set()); return }
    supabase
      .from('gewerk_standardaufgaben')
      .select('id, titel')
      .eq('gewerk_id', gewerkId)
      .order('sortierung')
      .then(({ data }) => {
        setStandardaufgaben(data ?? [])
        setAusgewaehlteIds(new Set())
      })
  }, [gewerkId])

  const gewerkName = useMemo(() => gewerke.find((g) => g.id === gewerkId)?.name ?? null, [gewerke, gewerkId])

  function toggleAusgewaehlt(id: string) {
    setAusgewaehlteIds((vorherig) => {
      const neu = new Set(vorherig)
      neu.has(id) ? neu.delete(id) : neu.add(id)
      return neu
    })
  }

  function formularZuruecksetzen() {
    setGewerkId(''); setStandardaufgaben([]); setAusgewaehlteIds(new Set())
    setTitel(''); setFaelligAm('')
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const zeilen: { projekt_id: string; titel: string; gewerk: string | null; faellig_am: string | null }[] = []
    for (const sa of standardaufgaben) {
      if (ausgewaehlteIds.has(sa.id)) {
        zeilen.push({ projekt_id: projektId, titel: sa.titel, gewerk: gewerkName, faellig_am: faelligAm || null })
      }
    }
    if (titel.trim()) {
      zeilen.push({ projekt_id: projektId, titel: titel.trim(), gewerk: gewerkName, faellig_am: faelligAm || null })
    }
    if (zeilen.length === 0) return

    setSpeichert(true)
    const { error } = await supabase.from('aufgaben').insert(zeilen)
    setSpeichert(false)
    if (!error) {
      formularZuruecksetzen()
      setZeigeFormular(false)
      laden()
    }
  }

  async function toggleErledigt(a: Aufgabe) {
    const neuerStatus = a.status === 'erledigt' ? 'offen' : 'erledigt'
    await supabase.from('aufgaben').update({ status: neuerStatus }).eq('id', a.id)
    laden()
  }

  const anzahlAusgewaehlt = ausgewaehlteIds.size
  const anzahlGesamt = anzahlAusgewaehlt + (titel.trim() ? 1 : 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Aufgabe'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 220px' }}>
              Gewerk
              <select style={eingabeStil} value={gewerkId} onChange={(e) => setGewerkId(e.target.value)}>
                <option value="">– kein Gewerk –</option>
                {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 200px' }}>
              Fällig am (optional, gilt für alle hier angelegten Aufgaben)
              <input type="date" style={eingabeStil} value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
            </label>
          </div>

          {gewerkId && standardaufgaben.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 6 }}>
                Aus Standard-Checkliste übernehmen{anzahlAusgewaehlt > 0 ? ` (${anzahlAusgewaehlt} ausgewählt)` : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(40,28,14,.03)', borderRadius: 10, padding: 10 }}>
                {standardaufgaben.map((a) => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={ausgewaehlteIds.has(a.id)} onChange={() => toggleAusgewaehlt(a.id)} />
                    {a.titel}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            {gewerkId ? 'Zusätzliche eigene Aufgabe (optional)' : 'Titel'}
            <input style={eingabeStil} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z.B. Baustelle einrichten" />
          </label>

          <button type="submit" style={knopfStil} disabled={speichert || anzahlGesamt === 0}>
            {speichert ? 'Speichert …' : anzahlGesamt > 1 ? `${anzahlGesamt} Aufgaben anlegen` : 'Aufgabe speichern'}
          </button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Aufgaben …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Aufgaben konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && aufgaben.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Aufgaben.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {aufgaben.map((a) => (
          <div key={a.id} style={{ ...karteStil, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0 }}>
              <input type="checkbox" checked={a.status === 'erledigt'} onChange={() => toggleErledigt(a)} />
              <span
                style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: a.status === 'erledigt' ? 'line-through' : 'none',
                  color: a.status === 'erledigt' ? 'var(--ink-faint)' : 'var(--ink)',
                }}
              >
                {a.titel}
              </span>
            </label>
            {a.gewerk && <span style={pillStil('neutral')}>{a.gewerk}</span>}
            {a.faellig_am && (
              <span style={{ fontSize: 12, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                {new Date(a.faellig_am).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
