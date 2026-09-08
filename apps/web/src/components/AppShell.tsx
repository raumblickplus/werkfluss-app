import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import Marke from './Marke'

// Baugleich mit der Sidebar+Topbar-Struktur aus dem Klick-Prototyp
// (app.html: .app / .sidebar / .main / .topbar). Bislang gibt es nur den
// Bereich "Projekte" – die Icon-Leiste ist bewusst so gebaut, dass weitere
// Module (Team, Einstellungen, …) hier später einfach ergänzt werden.
export default function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  const { aktivFirma, firmen, setAktivFirmaId, signOut } = useAuth()

  return (
    <div className="app">
      <div className="sidebar liquid">
        <div className="brand">
          <Marke />
        </div>
        <div className="nav">
          <button className="active" data-tip="Projekte" onClick={() => navigate('/')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5 12 3l9 6.5" />
              <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
            </svg>
          </button>
        </div>
        <div className="sidebar-foot">
          {firmen.length > 1 ? (
            <select
              value={aktivFirma?.id ?? ''}
              onChange={(e) => setAktivFirmaId(e.target.value)}
              style={{
                all: 'unset', fontSize: 9, fontWeight: 700, color: 'var(--ink-faint)', textAlign: 'center',
                maxWidth: 60, cursor: 'pointer',
              }}
              title={aktivFirma?.name}
            >
              {firmen.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          ) : (
            <div className="user-chip" title={aktivFirma?.name}>
              <div className="av">{(aktivFirma?.name ?? '?').slice(0, 2).toUpperCase()}</div>
            </div>
          )}
          <button className="abmelden-link" onClick={() => signOut()}>Abmelden</button>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          {actions && <div className="topbar-actions">{actions}</div>}
        </div>
        <div style={{ maxWidth: 880 }}>{children}</div>
      </div>
    </div>
  )
}
