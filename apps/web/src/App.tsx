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
import TeamChat from './pages/TeamChat'
import Zeitplan from './pages/Zeitplan'
import Einstellungen from './pages/Einstellungen'
import Finanzen from './pages/Finanzen'
import Maengel from './pages/Maengel'
import Tagesbericht from './pages/Tagesbericht'
import Netzwerk from './pages/Netzwerk'
import Projektmappe from './pages/Projektmappe'
import Kundenansicht from './pages/Kundenansicht'

export default function App() {
  const { session, ladeStatus, firmen, bauherrProjekte } = useAuth()
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
  // Eine Person ohne eigene Firma, aber mit mindestens einer Bauherr-
  // Mitgliedschaft (siehe 0021_bauherr_ohne_firma.sql), ist ein privater
  // Bauherr - die bekommt die eigene, stark vereinfachte Kundenansicht
  // statt der vollen Profi-Oberfläche mit allen Modulen. Wer noch gar
  // nirgends Mitglied ist, landet wie bisher bei "Firma anlegen".
  if (firmen.length === 0 && bauherrProjekte.length > 0) return <Kundenansicht />
  if (firmen.length === 0) return <FirmaAnlegen />

  return (
    <Routes>
      <Route path="/" element={<Projekte />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/projekte/:id" element={<ProjektDetail />} />
      <Route path="/team" element={<Team />} />
      <Route path="/team-chat" element={<TeamChat />} />
      <Route path="/zeitplan" element={<Zeitplan />} />
      <Route path="/einstellungen" element={<Einstellungen />} />
      <Route path="/finanzen" element={<Finanzen />} />
      <Route path="/maengel" element={<Maengel />} />
      <Route path="/tagesbericht" element={<Tagesbericht />} />
      <Route path="/netzwerk" element={<Netzwerk />} />
      <Route path="/projektmappe" element={<Projektmappe />} />
      <Route path="/modul/:modulId" element={<ModulPlatzhalter />} />
    </Routes>
  )
}
