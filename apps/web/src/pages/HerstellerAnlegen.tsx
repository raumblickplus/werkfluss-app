import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import Marke from '../components/Marke'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil } from './stil'

export default function HerstellerAnlegen({ onZurueck }: { onZurueck?: () => void }) {
  const { ladeHersteller, signOut } = useAuth()
  const [name, setName] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setSendet(true)
    const { error } = await supabase.rpc('create_hersteller_mit_inhaber', { hersteller_name: name })
    if (error) {
      setFehler(error.message)
      setSendet(false)
      return
    }
    await ladeHersteller()
    setSendet(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
      <Marke mitWort groesse={34} />
      <form onSubmit={absenden} style={{ ...karteStil, width: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>Hersteller/Lieferant werden</h1>
        <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: 14 }}>
          Lege dein Herstellerprofil an, um deinen Produktkatalog projektübergreifend in Werkfluss sichtbar zu machen –
          Bauherren und Handwerksbetriebe können daraus kostenfrei Muster anfragen.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
          Firmen-/Markenname
          <input style={eingabeStil} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {fehler && <div style={{ color: 'var(--red)', fontSize: 13 }}>{fehler}</div>}
        <button type="submit" style={knopfStil} disabled={sendet}>
          {sendet ? 'Wird angelegt …' : 'Herstellerprofil anlegen'}
        </button>
        {onZurueck && (
          <button type="button" onClick={onZurueck} style={{ ...knopfSekundaerStil, background: 'none', border: 'none' }}>
            ← Zurück
          </button>
        )}
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
