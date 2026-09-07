import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { eingabeStil, knopfStil, karteStil, knopfSekundaerStil } from './stil'

type Projekt = {
  id: string
  name: string
  status: string
  adresse: string | null
  start_datum: string | null
}

const statusLabel: Record<string, string> = {
  planung: 'Planung',
  ausfuehrung: 'Ausführung',
  abnahme: 'Abnahme',
  abgeschlossen: 'Abgeschlossen',
  pausiert: 'Pausiert',
}

export default function Projekte() {
  const { aktivFirma, firmen, setAktivFirmaId, signOut } = useAuth()
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [neuerName, setNeuerName] = useState('')
  const [neueAdresse, setNeueAdresse] = useState('')

  async function ladeProjekte() {
    if (!aktivFirma) return
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('projekte')
      .select('id, name, status, adresse, start_datum')
      .eq('firma_id', aktivFirma.id)
      .order('erstellt_am', { ascending: false })

    if (error) {
      setLadeStatus('fehler')
      return
    }
    setProjekte(data ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => {
    ladeProjekte()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivFirma?.id])

  async function projektAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma) return
    const { error } = await supabase.from('projekte').insert({
      firma_id: aktivFirma.id,
      name: neuerName,
      adresse: neueAdresse || null,
    })
    if (!error) {
      setNeuerName('')
      setNeueAdresse('')
      setZeigeFormular(false)
      ladeProjekte()
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: 760, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Projekte</h1>
          {firmen.length > 1 ? (
            <select
              value={aktivFirma?.id ?? ''}
              onChange={(e) => setAktivFirmaId(e.target.value)}
              style={{ ...eingabeStil, marginTop: 6, fontSize: 13 }}
            >
              {firmen.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          ) : (
            <p style={{ margin: '4px 0 0', color: 'var(--ink-dim)', fontSize: 14 }}>{aktivFirma?.name}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
            {zeigeFormular ? 'Abbrechen' : '+ Neues Projekt'}
          </button>
          <button style={knopfSekundaerStil} onClick={() => signOut()}>Abmelden</button>
        </div>
      </header>

      {zeigeFormular && (
        <form onSubmit={projektAnlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Projektname
            <input style={eingabeStil} value={neuerName} onChange={(e) => setNeuerName(e.target.value)} required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Adresse (optional)
            <input style={eingabeStil} value={neueAdresse} onChange={(e) => setNeueAdresse(e.target.value)} />
          </label>
          <button type="submit" style={knopfStil}>Projekt speichern</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Projekte …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Projekte konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && projekte.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Projekte – lege dein erstes Projekt an.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {projekte.map((p) => (
          <div key={p.id} style={{ ...karteStil, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              {p.adresse && <div style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{p.adresse}</div>}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'oklch(93% 0.01 70)', color: 'var(--ink-dim)' }}>
              {statusLabel[p.status] ?? p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
