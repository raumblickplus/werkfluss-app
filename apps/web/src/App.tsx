import { Routes, Route, useLocation } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import FirmaAnlegen from './pages/FirmaAnlegen'
import Projekte from './pages/Projekte'
import ProjektDetail from './pages/ProjektDetail'
import EinladungAnnehmen from './pages/EinladungAnnehmen'

export default function App() {
  const { session, ladeStatus, firmen } = useAuth()
  const location = useLocation()

  // Einladungslinks funktionieren unabhängig vom Anmeldestatus – die Seite
  // selbst zeigt bei Bedarf Login/Firma-Anlegen an, bevor sie die Einladung
  // annimmt.
  if (location.pathname.startsWith('/einladung/')) {
    return (
      <Routes>
        <Route path="/einladung/:token" element={<EinladungAnnehmen />} />
      </Routes>
    )
  }

  if (ladeStatus === 'laedt') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)' }}>
        Lädt …
      </div>
    )
  }

  if (!session) return <Login />
  if (firmen.length === 0) return <FirmaAnlegen />

  return (
    <Routes>
      <Route path="/" element={<Projekte />} />
      <Route path="/projekte/:id" element={<ProjektDetail />} />
    </Routes>
  )
}
