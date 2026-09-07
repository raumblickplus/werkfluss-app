import { supabase } from './lib/supabaseClient'
import { useEffect, useState } from 'react'

const waveIcon = (
  <svg width="34" height="9" viewBox="0 0 360 90">
    <path
      d="M20 60 L45 30 L70 60 L95 30 Q140 15 175 45 Q210 75 250 45 Q285 20 330 45"
      fill="none"
      stroke="oklch(62% 0.17 52)"
      strokeWidth="14"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default function App() {
  const [status, setStatus] = useState<'pruefe' | 'verbunden' | 'nicht_konfiguriert' | 'fehler'>(
    'pruefe'
  )

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL
    if (!url) {
      setStatus('nicht_konfiguriert')
      return
    }
    supabase.auth.getSession().then(({ error }) => {
      setStatus(error ? 'fehler' : 'verbunden')
    })
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 16px 34px rgba(120,90,45,.18)',
        }}
      >
        {waveIcon}
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, margin: 0 }}>Werkfluss</h1>
      <p style={{ color: 'var(--ink-dim)', maxWidth: 420, textAlign: 'center', margin: 0 }}>
        Grundgerüst der echten Plattform. Der bestehende Klick-Prototyp bleibt die Referenz für
        Aussehen und Funktionsumfang.
      </p>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          padding: '8px 14px',
          borderRadius: 999,
          background:
            status === 'verbunden'
              ? 'oklch(90% 0.08 148)'
              : status === 'fehler'
              ? 'oklch(92% 0.08 27)'
              : 'oklch(93% 0.01 70)',
          color:
            status === 'verbunden'
              ? 'oklch(30% 0.08 148)'
              : status === 'fehler'
              ? 'var(--red)'
              : 'var(--ink-dim)',
        }}
      >
        {status === 'pruefe' && 'Prüfe Supabase-Verbindung …'}
        {status === 'verbunden' && 'Supabase verbunden ✓'}
        {status === 'nicht_konfiguriert' &&
          'Supabase noch nicht konfiguriert – siehe .env.example'}
        {status === 'fehler' && 'Verbindung zu Supabase fehlgeschlagen'}
      </div>
    </div>
  )
}
