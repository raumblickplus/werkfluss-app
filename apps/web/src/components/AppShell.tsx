import type { CSSProperties, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import Marke from './Marke'

type NavItem = { id: string; label: string; icon: ReactNode }
// Jede Gruppe bekommt eine eigene Blockfarbe (Akzent), damit die Sidebar
// wie eine gestapelte Kachel-Navigation im neuen Farbblock-Design wirkt.
type NavGroup = { titel: string; items: NavItem[]; akzent: { bg: string; text: string } }

const ic = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  projekte: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
    </svg>
  ),
  finanzen: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M9 15.5c0 1.1 1.2 2 3 2s3-.7 3-1.8-1.2-1.6-3-2-3-.9-3-2 1.2-1.8 3-1.8 3 .9 3 2" />
    </svg>
  ),
  zeitplan: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M8 3v3M16 3v3" />
    </svg>
  ),
  tagesbericht: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3.5h10a1 1 0 0 1 1 1V21l-3.5-2-2.5 2-2.5-2L6 21V4.5a1 1 0 0 1 1-1Z" /><path d="M9 8.5h6M9 12h6" />
    </svg>
  ),
  meintag: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z" /><circle cx="12" cy="9" r="2.6" />
    </svg>
  ),
  maengel: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" />
    </svg>
  ),
  cadbim: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M12 21v-9M4 7.5 12 12l8-4.5" />
    </svg>
  ),
  buchhaltung: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  ),
  kommunikation: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a7.5 7.5 0 0 1-11.4 6.4L4 19l1.2-4.6A7.5 7.5 0 1 1 21 11.5Z" />
    </svg>
  ),
  networking: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="2.8" /><circle cx="17" cy="7" r="2.8" /><circle cx="12" cy="18" r="2.8" />
      <path d="m9.2 8.7 1.6 6.4M14.8 8.7l-1.6 6.4M9.6 7h4.8" />
    </svg>
  ),
  ausschreibung: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3.5h8l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" /><path d="M9 12.5h6M9 16h6" />
    </svg>
  ),
  foerdermittel: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="m9 15 6-6M9 9h.01M15 15h.01" />
    </svg>
  ),
  projektmappe: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-10Z" />
    </svg>
  ),
  team: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" /><path d="M2.5 19c0-3 3-5 6.5-5s6.5 2 6.5 5" /><circle cx="17.5" cy="8.5" r="2.3" /><path d="M15.5 19c.3-2.2 2-3.7 4-4" />
    </svg>
  ),
  einstellungen: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1h-.2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5v-.2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
} satisfies Record<string, ReactNode>

const navGroups: NavGroup[] = [
  {
    titel: 'Übersicht',
    akzent: { bg: '#C1552F', text: '#F7F3E7' },
    items: [{ id: 'dashboard', label: 'Dashboard', icon: ic.dashboard }],
  },
  {
    titel: 'Projekt (Baustelle)',
    akzent: { bg: '#7C8566', text: '#F7F3E7' },
    items: [
      { id: 'projekte', label: 'Projekte', icon: ic.projekte },
      { id: 'meintag', label: 'Mein Tag', icon: ic.meintag },
      { id: 'zeitplan', label: 'Zeitplan', icon: ic.zeitplan },
      { id: 'tagesbericht', label: 'Tagesbericht', icon: ic.tagesbericht },
      { id: 'maengel', label: 'Mängel & Abnahme', icon: ic.maengel },
      { id: 'cadbim', label: 'CAD/BIM', icon: ic.cadbim },
    ],
  },
  {
    titel: 'Finanzen',
    akzent: { bg: '#E2B62E', text: '#2A2410' },
    items: [
      { id: 'finanzen', label: 'Übersicht', icon: ic.finanzen },
      { id: 'buchhaltung', label: 'Buchhaltung', icon: ic.buchhaltung },
    ],
  },
  {
    titel: 'Zusammenarbeit',
    akzent: { bg: '#575D46', text: '#F7F3E7' },
    items: [
      { id: 'kommunikation', label: 'Kommunikation', icon: ic.kommunikation },
      { id: 'networking', label: 'Netzwerk', icon: ic.networking },
      { id: 'ausschreibung', label: 'Ausschreibung & LV', icon: ic.ausschreibung },
      { id: 'foerdermittel', label: 'Fördermittel', icon: ic.foerdermittel },
      { id: 'projektmappe', label: 'Projektmappe', icon: ic.projektmappe },
    ],
  },
  {
    titel: 'Verwaltung',
    akzent: { bg: '#FBF8F0', text: '#1C1A14' },
    items: [
      { id: 'team', label: 'Team', icon: ic.team },
      { id: 'team-chat', label: 'Team-Chat', icon: ic.kommunikation },
      { id: 'einstellungen', label: 'Einstellungen', icon: ic.einstellungen },
    ],
  },
]

// Interne Firma-Rollen (firma_mitglieder.rolle, siehe 0022_mitarbeiter_rechte.sql):
// Finanzen/Buchhaltung enthält ausschließlich sensible Finanzdaten und wird
// für alle ohne Finanzrolle komplett ausgeblendet. Team und Einstellungen
// bleiben dagegen für alle sichtbar - die brauchen z.B. jedes Mitglied für
// die eigene Team-Übersicht bzw. das eigene Profil/Passwort; die admin-
// pflichtigen Teile davon (Firma bearbeiten, Mitglieder einladen/entfernen)
// blenden Team.tsx/Einstellungen.tsx bereits selbst anhand von istAdmin aus.
const FINANZ_ROLLEN = ['inhaber', 'geschaeftsfuehrung', 'finanzen']

function istNavPunktSichtbar(id: string, rolle: string | undefined) {
  if (id === 'finanzen' || id === 'buchhaltung') return !!rolle && FINANZ_ROLLEN.includes(rolle)
  return true
}

function pfadFuer(id: string) {
  if (id === 'projekte') return '/'
  if (id === 'dashboard') return '/dashboard'
  if (id === 'team') return '/team'
  if (id === 'zeitplan') return '/zeitplan'
  if (id === 'meintag') return '/mein-tag'
  if (id === 'ausschreibung') return '/ausschreibung'
  if (id === 'finanzen') return '/finanzen'
  if (id === 'buchhaltung') return '/finanzen?tab=buchhaltung'
  if (id === 'maengel') return '/maengel'
  if (id === 'tagesbericht') return '/tagesbericht'
  if (id === 'networking') return '/netzwerk'
  if (id === 'projektmappe') return '/projektmappe'
  if (id === 'einstellungen') return '/einstellungen'
  if (id === 'team-chat') return '/team-chat'
  return `/modul/${id}`
}

// Baugleich mit der Sidebar+Topbar-Struktur aus dem Klick-Prototyp
// (app.html: .app / .sidebar / .main / .topbar), inkl. aller Modul-Gruppen
// aus dem Konzept. "Projekte" ist fertig gebaut, alle anderen Punkte
// führen vorerst zu einer Übersichtsseite mit dem geplanten Umfang/Phase –
// bewusst so, damit das Gesamtbild der App schon jetzt sichtbar ist.
export default function AppShell({
  title,
  subtitle,
  actions,
  wide = false,
  children,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { aktivFirma, firmen, setAktivFirmaId, signOut } = useAuth()

  function istAktiv(id: string) {
    if (id === 'projekte') return location.pathname === '/' || location.pathname.startsWith('/projekte')
    if (id === 'dashboard') return location.pathname === '/dashboard'
    if (id === 'team') return location.pathname === '/team'
    if (id === 'zeitplan') return location.pathname === '/zeitplan'
    if (id === 'meintag') return location.pathname === '/mein-tag'
    if (id === 'ausschreibung') return location.pathname === '/ausschreibung'
    if (id === 'finanzen') return location.pathname === '/finanzen' && location.search !== '?tab=buchhaltung'
    if (id === 'buchhaltung') return location.pathname === '/finanzen' && location.search === '?tab=buchhaltung'
    if (id === 'maengel') return location.pathname === '/maengel'
    if (id === 'tagesbericht') return location.pathname === '/tagesbericht'
    if (id === 'networking') return location.pathname === '/netzwerk'
    if (id === 'projektmappe') return location.pathname === '/projektmappe'
    if (id === 'einstellungen') return location.pathname === '/einstellungen'
    if (id === 'team-chat') return location.pathname === '/team-chat'
    return location.pathname === `/modul/${id}`
  }

  return (
    <div className="app">
      <div className="sidebar liquid">
        <div className="brand">
          <Marke mitWort groesse={32} />
        </div>
        <div className="nav">
          {navGroups.map((gruppe) => {
            const sichtbareItems = gruppe.items.filter((item) => istNavPunktSichtbar(item.id, aktivFirma?.rolle))
            if (sichtbareItems.length === 0) return null
            return (
              <div
                key={gruppe.titel}
                className="nav-group"
                style={{ '--accent-solid': gruppe.akzent.bg, '--accent-text': gruppe.akzent.text } as CSSProperties}
              >
                <div className="nav-group-title">{gruppe.titel}</div>
                {sichtbareItems.map((item) => (
                  <button
                    key={item.id}
                    className={`nav-item${istAktiv(item.id) ? ' active' : ''}`}
                    onClick={() => navigate(pfadFuer(item.id))}
                  >
                    <span className="ico">{item.icon}</span>
                    <span className="lbl">{item.label}</span>
                  </button>
                ))}
              </div>
            )
          })}
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
        <div style={{ maxWidth: wide ? 1480 : 880 }}>{children}</div>
      </div>
    </div>
  )
}
