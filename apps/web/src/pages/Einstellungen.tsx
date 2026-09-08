import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, eingabeStil, knopfStil } from './stil'

type FirmaDetails = {
  id: string
  name: string
  rechtsform: string | null
  adresse: string | null
  ust_id: string | null
}

export default function Einstellungen() {
  const { session, aktivFirma, ladeFirmen } = useAuth()
  const istAdmin = aktivFirma?.rolle === 'inhaber' || aktivFirma?.rolle === 'geschaeftsfuehrung'

  // Firma
  const [firma, setFirma] = useState<FirmaDetails | null>(null)
  const [firmaLadeStatus, setFirmaLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [firmaSpeichern, setFirmaSpeichern] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit')

  // Profil
  const [vollname, setVollname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [profilLadeStatus, setProfilLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [profilSpeichern, setProfilSpeichern] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit')

  // Passwort
  const [neuesPasswort, setNeuesPasswort] = useState('')
  const [passwortWiederholen, setPasswortWiederholen] = useState('')
  const [passwortStatus, setPasswortStatus] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit')
  const [passwortFehler, setPasswortFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!aktivFirma) return
    setFirmaLadeStatus('laedt')
    supabase
      .from('firmen')
      .select('id, name, rechtsform, adresse, ust_id')
      .eq('id', aktivFirma.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFirma(data as FirmaDetails)
        setFirmaLadeStatus('bereit')
      })
  }, [aktivFirma?.id])

  useEffect(() => {
    const nutzerId = session?.user?.id
    if (!nutzerId) return
    setProfilLadeStatus('laedt')
    supabase
      .from('profile')
      .select('vollname, telefon, email')
      .eq('id', nutzerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setVollname(data.vollname ?? '')
          setTelefon(data.telefon ?? '')
          setEmail(data.email ?? '')
        }
        setProfilLadeStatus('bereit')
      })
  }, [session?.user?.id])

  async function firmaSpeichernHandler(e: FormEvent) {
    e.preventDefault()
    if (!firma) return
    setFirmaSpeichern('speichert')
    const { error } = await supabase
      .from('firmen')
      .update({ name: firma.name, rechtsform: firma.rechtsform, adresse: firma.adresse, ust_id: firma.ust_id })
      .eq('id', firma.id)
    if (error) { setFirmaSpeichern('fehler'); return }
    setFirmaSpeichern('gespeichert')
    await ladeFirmen()
    setTimeout(() => setFirmaSpeichern('bereit'), 2000)
  }

  async function profilSpeichernHandler(e: FormEvent) {
    e.preventDefault()
    const nutzerId = session?.user?.id
    if (!nutzerId) return
    setProfilSpeichern('speichert')
    const { error } = await supabase.from('profile').update({ vollname, telefon: telefon || null }).eq('id', nutzerId)
    if (error) { setProfilSpeichern('fehler'); return }
    setProfilSpeichern('gespeichert')
    setTimeout(() => setProfilSpeichern('bereit'), 2000)
  }

  async function passwortAendernHandler(e: FormEvent) {
    e.preventDefault()
    setPasswortFehler(null)
    if (neuesPasswort.length < 8) { setPasswortFehler('Mindestens 8 Zeichen.'); return }
    if (neuesPasswort !== passwortWiederholen) { setPasswortFehler('Die Passwörter stimmen nicht überein.'); return }
    setPasswortStatus('speichert')
    const { error } = await supabase.auth.updateUser({ password: neuesPasswort })
    if (error) { setPasswortFehler(error.message); setPasswortStatus('fehler'); return }
    setNeuesPasswort(''); setPasswortWiederholen('')
    setPasswortStatus('gespeichert')
    setTimeout(() => setPasswortStatus('bereit'), 2000)
  }

  return (
    <AppShell title="Einstellungen" subtitle={aktivFirma?.name}>
      <h3 style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 8px', fontWeight: 700 }}>Firma</h3>
      <div style={{ ...karteStil, marginBottom: 24 }}>
        {firmaLadeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Lädt …</p>}
        {firmaLadeStatus === 'bereit' && firma && (
          <form onSubmit={firmaSpeichernHandler} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!istAdmin && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>
                Nur Inhaber:innen und Geschäftsführung können die Firmendaten bearbeiten.
              </p>
            )}
            <div className="field">
              <label>Firmenname</label>
              <input style={eingabeStil} value={firma.name} disabled={!istAdmin} onChange={(e) => setFirma({ ...firma, name: e.target.value })} required />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>Rechtsform</label>
                <input style={eingabeStil} value={firma.rechtsform ?? ''} disabled={!istAdmin} onChange={(e) => setFirma({ ...firma, rechtsform: e.target.value })} placeholder="z.B. GmbH, Einzelunternehmen" />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>USt-IdNr. (optional)</label>
                <input style={eingabeStil} value={firma.ust_id ?? ''} disabled={!istAdmin} onChange={(e) => setFirma({ ...firma, ust_id: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Adresse</label>
              <input style={eingabeStil} value={firma.adresse ?? ''} disabled={!istAdmin} onChange={(e) => setFirma({ ...firma, adresse: e.target.value })} />
            </div>
            {istAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="submit" style={knopfStil} disabled={firmaSpeichern === 'speichert'}>
                  {firmaSpeichern === 'speichert' ? 'Speichert …' : 'Firmendaten speichern'}
                </button>
                {firmaSpeichern === 'gespeichert' && <span style={{ fontSize: 12.5, color: 'var(--olive)' }}>Gespeichert ✓</span>}
                {firmaSpeichern === 'fehler' && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>Fehler beim Speichern.</span>}
              </div>
            )}
          </form>
        )}
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 8px', fontWeight: 700 }}>Mein Profil</h3>
      <div style={{ ...karteStil, marginBottom: 24 }}>
        {profilLadeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Lädt …</p>}
        {profilLadeStatus === 'bereit' && (
          <form onSubmit={profilSpeichernHandler} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>Vollständiger Name</label>
                <input style={eingabeStil} value={vollname} onChange={(e) => setVollname(e.target.value)} required />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>Telefon (optional)</label>
                <input style={eingabeStil} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>E-Mail</label>
              <input style={{ ...eingabeStil, opacity: 0.6 }} value={email} disabled />
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-faint)' }}>
              Ändern der E-Mail-Adresse folgt später (braucht eine Bestätigungs-Mail).
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="submit" style={knopfStil} disabled={profilSpeichern === 'speichert'}>
                {profilSpeichern === 'speichert' ? 'Speichert …' : 'Profil speichern'}
              </button>
              {profilSpeichern === 'gespeichert' && <span style={{ fontSize: 12.5, color: 'var(--olive)' }}>Gespeichert ✓</span>}
              {profilSpeichern === 'fehler' && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>Fehler beim Speichern.</span>}
            </div>
          </form>
        )}
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 8px', fontWeight: 700 }}>Passwort ändern</h3>
      <div style={{ ...karteStil, marginBottom: 24 }}>
        <form onSubmit={passwortAendernHandler} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Neues Passwort</label>
              <input style={eingabeStil} type="password" value={neuesPasswort} onChange={(e) => setNeuesPasswort(e.target.value)} placeholder="Mindestens 8 Zeichen" />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Wiederholen</label>
              <input style={eingabeStil} type="password" value={passwortWiederholen} onChange={(e) => setPasswortWiederholen(e.target.value)} />
            </div>
          </div>
          {passwortFehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{passwortFehler}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" style={knopfStil} disabled={passwortStatus === 'speichert' || !neuesPasswort}>
              {passwortStatus === 'speichert' ? 'Speichert …' : 'Passwort ändern'}
            </button>
            {passwortStatus === 'gespeichert' && <span style={{ fontSize: 12.5, color: 'var(--olive)' }}>Geändert ✓</span>}
          </div>
        </form>
      </div>

      <p className="footnote">
        Benachrichtigungseinstellungen, Kalender-Sync und Abo-/Rechnungsverwaltung für Werkfluss selbst
        folgen mit späteren Ausbaustufen.
      </p>
    </AppShell>
  )
}
