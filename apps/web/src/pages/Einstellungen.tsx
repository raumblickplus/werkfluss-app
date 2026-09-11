import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, eingabeStil, knopfStil, knopfSekundaerStil } from './stil'
import { SPRACHEN } from '../components/UebersetzterText'

type FirmaDetails = {
  id: string
  name: string
  rechtsform: string | null
  adresse: string | null
  ust_id: string | null
  telefon: string | null
  email: string | null
  iban: string | null
  logo_url: string | null
  akzentfarbe: string
}

export default function Einstellungen() {
  const { session, aktivFirma, ladeFirmen } = useAuth()
  const istAdmin = aktivFirma?.rolle === 'inhaber' || aktivFirma?.rolle === 'geschaeftsfuehrung'

  // Firma
  const [firma, setFirma] = useState<FirmaDetails | null>(null)
  const [firmaLadeStatus, setFirmaLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [firmaSpeichern, setFirmaSpeichern] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit')
  const [logoDatei, setLogoDatei] = useState<File | null>(null)
  const [logoStatus, setLogoStatus] = useState<'bereit' | 'laedt-hoch' | 'fehler'>('bereit')

  // Profil
  const [vollname, setVollname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [profilLadeStatus, setProfilLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [profilSpeichern, setProfilSpeichern] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit')
  const [bevorzugteSprache, setBevorzugteSprache] = useState('DE')

  // Passwort
  const [neuesPasswort, setNeuesPasswort] = useState('')
  const [passwortWiederholen, setPasswortWiederholen] = useState('')
  const [passwortStatus, setPasswortStatus] = useState<'bereit' | 'speichert' | 'gespeichert' | 'fehler'>('bereit')
  const [passwortFehler, setPasswortFehler] = useState<string | null>(null)

  // Kalender-Abo
  const [kalenderToken, setKalenderToken] = useState<string | null>(null)
  const [kalenderLadeStatus, setKalenderLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [kalenderErstelltStatus, setKalenderErstelltStatus] = useState<'bereit' | 'erstellt' | 'fehler'>('bereit')
  const [kalenderKopiert, setKalenderKopiert] = useState<'webcal' | 'https' | null>(null)

  useEffect(() => {
    if (!aktivFirma) return
    setFirmaLadeStatus('laedt')
    supabase
      .from('firmen')
      .select('id, name, rechtsform, adresse, ust_id, telefon, email, iban, logo_url, akzentfarbe')
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
      .select('vollname, telefon, email, bevorzugte_sprache')
      .eq('id', nutzerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setVollname(data.vollname ?? '')
          setTelefon(data.telefon ?? '')
          setEmail(data.email ?? '')
          setBevorzugteSprache((data as { bevorzugte_sprache?: string }).bevorzugte_sprache ?? 'DE')
        }
        setProfilLadeStatus('bereit')
      })
  }, [session?.user?.id])

  useEffect(() => {
    const nutzerId = session?.user?.id
    if (!nutzerId) return
    setKalenderLadeStatus('laedt')
    supabase
      .from('profile')
      .select('kalender_token')
      .eq('id', nutzerId)
      .maybeSingle()
      .then(({ data }) => {
        setKalenderToken(data?.kalender_token ?? null)
        setKalenderLadeStatus('bereit')
      })
  }, [session?.user?.id])

  async function firmaSpeichernHandler(e: FormEvent) {
    e.preventDefault()
    if (!firma) return
    setFirmaSpeichern('speichert')
    const { error } = await supabase
      .from('firmen')
      .update({ name: firma.name, rechtsform: firma.rechtsform, adresse: firma.adresse, ust_id: firma.ust_id, telefon: firma.telefon, email: firma.email, iban: firma.iban, akzentfarbe: firma.akzentfarbe })
      .eq('id', firma.id)
    if (error) { setFirmaSpeichern('fehler'); return }
    setFirmaSpeichern('gespeichert')
    await ladeFirmen()
    setTimeout(() => setFirmaSpeichern('bereit'), 2000)
  }

  // Firmenlogo (Julian-Feedback 12.09.2026: "mit Logo der Firma") - nutzt
  // denselben öffentlichen "logos"-Bucket, der in Netzwerk.tsx bereits für
  // Kontakt-Logos existiert. Fester Dateiname je Firma (upsert), damit ein
  // erneuter Upload das alte Logo ersetzt statt Speicher zu verschwenden;
  // ein Zeitstempel-Query-Parameter an der gespeicherten URL verhindert,
  // dass Browser/Dokumente das alte, zwischengespeicherte Bild weiter zeigen.
  async function logoHochladen() {
    if (!firma || !logoDatei) return
    setLogoStatus('laedt-hoch')
    const endung = logoDatei.name.split('.').pop() || 'png'
    const pfad = `${firma.id}/firmenlogo.${endung}`
    const { error: uploadFehler } = await supabase.storage.from('logos').upload(pfad, await logoDatei.arrayBuffer(), {
      contentType: logoDatei.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: true,
    })
    if (uploadFehler) { setLogoStatus('fehler'); return }
    const basisUrl = supabase.storage.from('logos').getPublicUrl(pfad).data.publicUrl
    const logoUrl = `${basisUrl}?v=${Date.now()}`
    const { error: updateFehler } = await supabase.from('firmen').update({ logo_url: logoUrl }).eq('id', firma.id)
    if (updateFehler) { setLogoStatus('fehler'); return }
    setFirma({ ...firma, logo_url: logoUrl })
    setLogoDatei(null)
    setLogoStatus('bereit')
  }

  async function profilSpeichernHandler(e: FormEvent) {
    e.preventDefault()
    const nutzerId = session?.user?.id
    if (!nutzerId) return
    setProfilSpeichern('speichert')
    const { error } = await supabase.from('profile').update({ vollname, telefon: telefon || null, bevorzugte_sprache: bevorzugteSprache }).eq('id', nutzerId)
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

  async function kalenderAboEinrichten() {
    const nutzerId = session?.user?.id
    if (!nutzerId) return
    const neuerToken = crypto.randomUUID().replace(/-/g, '')
    setKalenderErstelltStatus('bereit')
    const { error } = await supabase.from('profile').update({ kalender_token: neuerToken }).eq('id', nutzerId)
    if (error) { setKalenderErstelltStatus('fehler'); return }
    setKalenderToken(neuerToken)
    setKalenderErstelltStatus('erstellt')
  }

  async function kalenderAboZuruecksetzen() {
    if (!confirm('Neuen Link erzeugen? Der bisherige Kalender-Abo-Link funktioniert danach nicht mehr, du müsstest das Abo in deinem Kalender neu einrichten.')) return
    await kalenderAboEinrichten()
  }

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  const kalenderHttpsUrl = kalenderToken ? `${supabaseUrl}/functions/v1/kalender-feed?token=${kalenderToken}` : null
  const kalenderWebcalUrl = kalenderHttpsUrl ? kalenderHttpsUrl.replace(/^https?:\/\//, 'webcal://') : null

  async function kalenderLinkKopieren(url: string, art: 'webcal' | 'https') {
    try {
      await navigator.clipboard.writeText(url)
      setKalenderKopiert(art)
      setTimeout(() => setKalenderKopiert(null), 2000)
    } catch {
      // Zwischenablage evtl. ohne Berechtigung - Link steht trotzdem sichtbar da.
    }
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
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>Telefon (für Rechnungs-/Angebotskopf)</label>
                <input style={eingabeStil} value={firma.telefon ?? ''} disabled={!istAdmin} onChange={(e) => setFirma({ ...firma, telefon: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>E-Mail (für Rechnungs-/Angebotskopf)</label>
                <input style={eingabeStil} value={firma.email ?? ''} disabled={!istAdmin} onChange={(e) => setFirma({ ...firma, email: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>IBAN (für Zahlungshinweis auf Rechnungen, optional)</label>
              <input style={eingabeStil} value={firma.iban ?? ''} disabled={!istAdmin} onChange={(e) => setFirma({ ...firma, iban: e.target.value })} placeholder="DE.." />
            </div>

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 14, marginTop: 4 }}>
              <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                Design für Rechnungen, Angebote &amp; Mahnungen
              </p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '1 1 220px' }}>
                  <label>Firmenlogo (optional)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {firma.logo_url && (
                      <img src={firma.logo_url} alt="Firmenlogo" style={{ height: 36, maxWidth: 100, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,.5)', border: '1px solid var(--glass-border)', padding: 4 }} />
                    )}
                    {istAdmin && (
                      <>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          onChange={(e) => setLogoDatei(e.target.files?.[0] ?? null)}
                          style={{ fontSize: 11.5, maxWidth: 180 }}
                        />
                        <button
                          type="button"
                          style={{ ...knopfSekundaerStil, fontSize: 11.5, padding: '6px 12px' }}
                          disabled={!logoDatei || logoStatus === 'laedt-hoch'}
                          onClick={logoHochladen}
                        >
                          {logoStatus === 'laedt-hoch' ? 'Lädt hoch …' : 'Hochladen'}
                        </button>
                      </>
                    )}
                  </div>
                  {logoStatus === 'fehler' && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>Logo konnte nicht gespeichert werden.</span>}
                </div>
                <div className="field" style={{ width: 140 }}>
                  <label>Akzentfarbe</label>
                  <input
                    type="color"
                    value={firma.akzentfarbe}
                    disabled={!istAdmin}
                    onChange={(e) => setFirma({ ...firma, akzentfarbe: e.target.value })}
                    style={{ width: '100%', height: 38, padding: 2, borderRadius: 8, border: '1px solid var(--glass-border)', cursor: istAdmin ? 'pointer' : 'default' }}
                  />
                </div>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--ink-faint)' }}>
                Logo und Akzentfarbe erscheinen automatisch im Kopf-/Summenblock jeder als PDF gedruckten Rechnung,
                jedes Angebots und jeder Mahnung. Die Akzentfarbe wird erst mit „Firmendaten speichern" unten übernommen.
              </p>
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
            <div className="field" style={{ maxWidth: 260 }}>
              <label>Sprache für Übersetzungen</label>
              <select style={eingabeStil} value={bevorzugteSprache} onChange={(e) => setBevorzugteSprache(e.target.value)}>
                {SPRACHEN.map((s) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--ink-faint)' }}>
                Bautagebuch- und Tagesbericht-Einträge werden dir automatisch in dieser Sprache angezeigt (bei Deutsch keine Übersetzung).
              </p>
            </div>
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

      <h3 style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 8px', fontWeight: 700 }}>Kalender-Abo</h3>
      <div style={{ ...karteStil, marginBottom: 24 }}>
        {kalenderLadeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Lädt …</p>}
        {kalenderLadeStatus === 'bereit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>
              Abonniere deine offenen Aufgaben aus allen deinen Projekten in Apple Kalender, Google Kalender
              oder Outlook. Das Abo ist einseitig: Aufgaben aus Werkfluss erscheinen in deinem Kalender,
              Termine aus dem Kalender wandern nicht zurück in Werkfluss.
            </p>
            {!kalenderToken && (
              <div>
                <button type="button" style={knopfStil} onClick={kalenderAboEinrichten}>
                  Kalender-Abo einrichten
                </button>
                {kalenderErstelltStatus === 'fehler' && (
                  <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--red)' }}>Fehler beim Einrichten.</p>
                )}
              </div>
            )}
            {kalenderToken && kalenderHttpsUrl && kalenderWebcalUrl && (
              <>
                <div className="field">
                  <label>Abo-Link (für Apple Kalender: Link direkt öffnen)</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input style={{ ...eingabeStil, flex: 1, minWidth: 220 }} value={kalenderWebcalUrl} readOnly onFocus={(e) => e.target.select()} />
                    <button type="button" style={knopfSekundaerStil} onClick={() => kalenderLinkKopieren(kalenderWebcalUrl, 'webcal')}>
                      {kalenderKopiert === 'webcal' ? 'Kopiert ✓' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>Abo-Link (für Google Kalender: "Über URL" / Outlook: "Aus dem Internet abonnieren")</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input style={{ ...eingabeStil, flex: 1, minWidth: 220 }} value={kalenderHttpsUrl} readOnly onFocus={(e) => e.target.select()} />
                    <button type="button" style={knopfSekundaerStil} onClick={() => kalenderLinkKopieren(kalenderHttpsUrl, 'https')}>
                      {kalenderKopiert === 'https' ? 'Kopiert ✓' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-faint)' }}>
                  Der Link ist geheim wie ein Passwort - wer ihn hat, sieht deine Aufgabentitel. Weitergeben nur
                  an dich selbst (z.B. für ein zweites Gerät). Kalender fragen den Link meist alle paar Stunden
                  neu ab, nicht sofort.
                </p>
                <div>
                  <button type="button" style={knopfSekundaerStil} onClick={kalenderAboZuruecksetzen}>
                    Neuen Link erzeugen
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <p className="footnote">
        Benachrichtigungseinstellungen und Abo-/Rechnungsverwaltung für Werkfluss selbst folgen mit
        späteren Ausbaustufen.
      </p>
    </AppShell>
  )
}
