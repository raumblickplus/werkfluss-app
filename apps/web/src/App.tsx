import { Routes, Route, useLocation } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import FirmaAnlegen from './pages/FirmaAnlegen'
import Dashboard from './pages/Dashboard'
import Projekte from './pages/Projekte'
import ProjektDetail from './pages/ProjektDetail'
import ModulPlatzhalter from './pages/ModulPlatzhalter'
import EinladungAnnehmen from './pages/EinladungAnnehmen'
import FirmaEinladungAnnehmen from './pages/FirmaEinladungAnnehmen'
import Team from './pages/Team'
import Zeitplan from './pages/Zeitplan'
import Einstellungen from './pages/Einstellungen'

export default function App() {
  const { session, ladeStatus, firmen } = useAuth()
  const location = useLocation()

  // Einladungslinks funktionieren unabhängig vom Anmeldestatus – die Seite
  // selbst zeigt bei Bedarf Login/Firma-Anlegen an, bevor sie die Einladung
  // annimmt.
  if (location.pathname.startsWith('/einladung/') || location.pathname.startsWith('/firma-einladung/')) {
    return (
      <Routes>
        <Route path="/einladung/:token" element={<EinladungAnnehmen />} />
        <Route path="/firma-einladung/:token" element={<FirmaEinladungAnnehmen />} />
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
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/projekte/:id" element={<ProjektDetail />} />
      <Route path="/team" element={<Team />} />
      <Route path="/zeitplan" element={<Zeitplan />} />
      <Route path="/einstellungen" element={<Einstellungen />} />
      <Route path="/modul/:modulId" element={<ModulPlatzhalter />} />
    </Routes>
  )
}
