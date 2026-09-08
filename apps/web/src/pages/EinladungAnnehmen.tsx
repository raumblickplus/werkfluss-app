import { useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import Marke from '../components/Marke'
import Login from './Login'
import FirmaAnlegen from './FirmaAnlegen'
import { karteStil, knopfStil } from './stil'

type EinladungsVorschau = {
  projekt_name: string
  firma_name: string
  rolle_im_projekt: string
  gewerk: string | null
  status: string
}

const rolleLabel: Record<string, string> = {
  generalunternehmer: 'Generalunternehmer',
  handwerker: 'Handwerker',
  architekt: 'Architekt',
  bauherr: 'Bauherr',
}

export default function EinladungAnnehmen() {
  const { token } = useParams<{ token: string }>()
  const { session, ladeStatus, aktivFirma } = useAuth()
  const [einladung, setEinladung] = useState<EinladungsVorschau | null>(null)
  const [ladeEinladung, setLadeEinladung] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [annahmeStatus, setAnnahmeStatus] = useState<'wartet' | 'laeuft' | 'fertig' | 'fehler'>('wartet')
  const [projektId, setProjektId] = useState<string | null>(null)
  const [fehlerText, setFehlerText] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    supabase
      .rpc('einladung_ansehen', { p_token: token })
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setLadeEinladung('fehler'); return }
        setEinladung(data as EinladungsVorschau)
        setLadeEinladung('bereit')
      })
  }, [token])

  useEffect(() => {
    if (!token || !session || !aktivFirma) return
    if (!einladung || einladung.status !== 'offen') return
    if (annahmeStatus !== 'wartet') return

    setAnnahmeStatus('laeuft')
    supabase
      .rpc('einladung_annehmen', { p_token: token, p_firma_id: aktivFirma.id })
      .then(({ data, error }) => {
        if (error) {
          setFehlerText(error.message)
          setAnnahmeStatus('fehler')
          return
        }
        setProjektId(data as string)
        setAnnahmeStatus('fertig')
      })
  }, [token, session, aktivFirma, einladung, annahmeStatus])

  if (ladeEinladung === 'laedt') {
    return <MitteSeite><p style={{ color: 'var(--ink-faint)' }}>Lädt …</p></MitteSeite>
  }
  if (ladeEinladung === 'fehler' || !einladung) {
    return (
      <MitteSeite>
        <p style={{ color: 'var(--red)' }}>Dieser Einladungslink ist ungültig.</p>
      </MitteSeite>
    )
  }
  if (einladung.status === 'angenommen' && annahmeStatus === 'wartet') {
    return (
      <MitteSeite>
        <p>Diese Einladung wurde bereits angenommen.</p>
        {session && <Link to="/" style={{ color: 'var(--orange-text)' }}>Zu deinen Projekten</Link>}
      </MitteSeite>
    )
  }
  if (einladung.status === 'zurueckgezogen') {
    return (
      <MitteSeite>
        <p style={{ color: 'var(--red)' }}>Diese Einladung wurde zurückgezogen.</p>
      </MitteSeite>
    )
  }

  const vorschau = (
    <div style={{ ...karteStil, marginBottom: 20, textAlign: 'center' }}>
      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--ink-faint)' }}>Du wurdest eingeladen</p>
      <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19 }}>{einladung.projekt_name}</p>
      <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-dim)' }}>
        von <strong>{einladung.firma_name}</strong> als {rolleLabel[einladung.rolle_im_projekt] ?? einladung.rolle_im_projekt}
        {einladung.gewerk ? ` (${einladung.gewerk})` : ''}
      </p>
    </div>
  )

  if (annahmeStatus === 'fertig') {
    return (
      <MitteSeite>
        {vorschau}
        <p style={{ color: 'var(--olive)' }}>Angenommen ✓ Du bist jetzt Teil dieses Projekts.</p>
        {projektId && (
          <Link to={`/projekte/${projektId}`} style={knopfStil}>Zum Projekt</Link>
        )}
      </MitteSeite>
    )
  }
  if (annahmeStatus === 'fehler') {
    return (
      <MitteSeite>
        {vorschau}
        <p style={{ color: 'var(--red)' }}>{fehlerText ?? 'Die Einladung konnte nicht angenommen werden.'}</p>
      </MitteSeite>
    )
  }

  if (ladeStatus === 'laedt') {
    return <MitteSeite>{vorschau}<p style={{ color: 'var(--ink-faint)' }}>Lädt …</p></MitteSeite>
  }
  if (!session) {
    return (
      <div>
        <div style={{ maxWidth: 420, margin: '32px auto 0' }}>{vorschau}</div>
        <Login />
      </div>
    )
  }
  if (!aktivFirma) {
    return (
      <div>
        <div style={{ maxWidth: 420, margin: '32px auto 0' }}>{vorschau}</div>
        <FirmaAnlegen />
      </div>
    )
  }

  return <MitteSeite>{vorschau}<p style={{ color: 'var(--ink-faint)' }}>Einladung wird angenommen …</p></MitteSeite>
}

function MitteSeite({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', padding: '48px 24px', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <Marke mitWort groesse={38} />
      </div>
      {children}
    </div>
  )
}
