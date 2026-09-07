import { Routes, Route } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import FirmaAnlegen from './pages/FirmaAnlegen'
import Projekte from './pages/Projekte'
import ProjektDetail from './pages/ProjektDetail'

export default function App() {
  const { session, ladeStatus, firmen } = useAuth()

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
