import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil } from '../stil'

type Aufgabe = {
  id: string
  titel: string
  status: 'offen' | 'in_bearbeitung' | 'erledigt'
  faellig_am: string | null
}

export default function Aufgaben({ projektId }: { projektId: string }) {
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [titel, setTitel] = useState('')
  const [faelligAm, setFaelligAm] = useState('')

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('aufgaben')
      .select('id, titel, status, faellig_am')
      .eq('projekt_id', projektId)
      .order('faellig_am', { ascending: true, nullsFirst: false })

    if (error) { setLadeStatus('fehler'); return }
    setAufgaben(data ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('aufgaben').insert({
      projekt_id: projektId,
      titel,
      faellig_am: faelligAm || null,
    })
    if (!error) {
      setTitel(''); setFaelligAm('')
      setZeigeFormular(false)
      laden()
    }
  }

  async function toggleErledigt(a: Aufgabe) {
    const neuerStatus = a.status === 'erledigt' ? 'offen' : 'erledigt'
    await supabase.from('aufgaben').update({ status: neuerStatus }).eq('id', a.id)
    laden()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Aufgabe'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Titel
            <input style={eingabeStil} value={titel} onChange={(e) => setTitel(e.target.value)} required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Fällig am (optional)
            <input type="date" style={eingabeStil} value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
          </label>
          <button type="submit" style={knopfStil}>Aufgabe speichern</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Aufgaben …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Aufgaben konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && aufgaben.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Aufgaben.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {aufgaben.map((a) => (
          <label
            key={a.id}
            style={{
              ...karteStil,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={a.status === 'erledigt'} onChange={() => toggleErledigt(a)} />
            <span style={{
              flex: 1,
              textDecoration: a.status === 'erledigt' ? 'line-through' : 'none',
              color: a.status === 'erledigt' ? 'var(--ink-faint)' : 'var(--ink)',
            }}>
              {a.titel}
            </span>
            {a.faellig_am && (
              <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                {new Date(a.faellig_am).toLocaleDateString('de-DE')}
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}
