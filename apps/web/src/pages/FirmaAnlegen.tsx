import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import Marke from '../components/Marke'
import { eingabeStil, knopfStil, karteStil } from './stil'

export default function FirmaAnlegen() {
  const { ladeFirmen, signOut } = useAuth()
  const [name, setName] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setSendet(true)
    const { error } = await supabase.rpc('create_firma_mit_inhaber', { firma_name: name })
    if (error) {
      setFehler(error.message)
      setSendet(false)
      return
    }
    await ladeFirmen()
    setSendet(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
      <Marke mitWort groesse={34} />
      <form onSubmit={absenden} style={{ ...karteStil, width: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>Firma anlegen</h1>
        <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: 14 }}>
          Du bist noch keiner Firma zugeordnet. Lege deine Firma an, um Projekte zu verwalten.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
          Firmenname
          <input style={eingabeStil} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {fehler && <div style={{ color: 'var(--red)', fontSize: 13 }}>{fehler}</div>}
        <button type="submit" style={knopfStil} disabled={sendet}>Firma anlegen</button>
        <button
          type="button"
          onClick={() => signOut()}
          style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', fontSize: 13, cursor: 'pointer', padding: 0 }}
        >
          Abmelden
        </button>
      </form>
    </div>
  )
}
