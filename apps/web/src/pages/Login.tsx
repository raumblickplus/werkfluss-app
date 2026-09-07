import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil } from './stil'

export default function Login() {
  const [modus, setModus] = useState<'login' | 'registrieren'>('login')
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [vollname, setVollname] = useState('')
  const [meldung, setMeldung] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setMeldung(null)
    setSendet(true)

    if (modus === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
      if (error) setFehler(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: passwort,
        options: { data: { vollname } },
      })
      if (error) {
        setFehler(error.message)
      } else if (!data.session) {
        setMeldung('Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir gerade geschickt haben, und melde dich danach an.')
      }
    }
    setSendet(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={absenden} style={{ ...karteStil, width: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>
          {modus === 'login' ? 'Anmelden' : 'Firma registrieren'}
        </h1>
        <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: 14 }}>
          {modus === 'login'
            ? 'Melde dich mit deinem Werkfluss-Konto an.'
            : 'Lege dein persönliches Konto an – die Firma richtest du im nächsten Schritt ein.'}
        </p>

        {modus === 'registrieren' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Voller Name
            <input
              style={eingabeStil}
              value={vollname}
              onChange={(e) => setVollname(e.target.value)}
              required
            />
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
          E-Mail
          <input
            type="email"
            style={eingabeStil}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
          Passwort
          <input
            type="password"
            style={eingabeStil}
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            minLength={6}
            required
          />
        </label>

        {fehler && <div style={{ color: 'var(--red)', fontSize: 13 }}>{fehler}</div>}
        {meldung && <div style={{ color: 'var(--olive)', fontSize: 13 }}>{meldung}</div>}

        <button type="submit" style={knopfStil} disabled={sendet}>
          {modus === 'login' ? 'Anmelden' : 'Konto anlegen'}
        </button>

        <button
          type="button"
          onClick={() => {
            setModus(modus === 'login' ? 'registrieren' : 'login')
            setFehler(null)
            setMeldung(null)
          }}
          style={{ background: 'none', border: 'none', color: 'var(--orange-text)', fontSize: 13, cursor: 'pointer', padding: 0 }}
        >
          {modus === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon registriert? Anmelden'}
        </button>
      </form>
    </div>
  )
}
