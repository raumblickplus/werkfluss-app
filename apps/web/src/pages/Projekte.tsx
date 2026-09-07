import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { adresseZuKoordinaten } from '../lib/wetter'
import { useAuth } from '../lib/AuthContext'
import Logo from '../components/Logo'
import AdresseSuche, { googleAdresssucheVerfuegbar } from '../components/AdresseSuche'
import { eingabeStil, knopfStil, karteStil, knopfSekundaerStil, projektStatusLabel } from './stil'

type Projekt = {
  id: string
  name: string
  status: string
  adresse: string | null
}

export default function Projekte() {
  const { aktivFirma, firmen, setAktivFirmaId, signOut } = useAuth()
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [neuerName, setNeuerName] = useState('')
  const [neueAdresse, setNeueAdresse] = useState('')
  const [neueKoordinaten, setNeueKoordinaten] = useState<{ breitengrad: number; laengengrad: number } | null>(null)
  const googleAktiv = googleAdresssucheVerfuegbar()

  async function ladeProjekte() {
    if (!aktivFirma) return
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('projekte')
      .select('id, name, status, adresse')
      .eq('firma_id', aktivFirma.id)
      .order('erstellt_am', { ascending: false })

    if (error) {
      setLadeStatus('fehler')
      return
    }
    setProjekte(data ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => {
    ladeProjekte()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivFirma?.id])

  async function projektAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma) return

    // Wenn die Google-Adresssuche eine Adresse ausgewählt hat, nutzen wir deren
    // Koordinaten direkt. Sonst (freies Textfeld) versuchen wir es über die
    // kostenlose Geocoding-Schätzung.
    const koordinaten = neueKoordinaten ?? (neueAdresse ? await adresseZuKoordinaten(neueAdresse) : null)

    const { error } = await supabase.from('projekte').insert({
      firma_id: aktivFirma.id,
      name: neuerName,
      adresse: neueAdresse || null,
      breitengrad: koordinaten?.breitengrad ?? null,
      laengengrad: koordinaten?.laengengrad ?? null,
    })
    if (!error) {
      setNeuerName('')
      setNeueAdresse('')
      setNeueKoordinaten(null)
      setZeigeFormular(false)
      ladeProjekte()
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: 760, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Logo size={44} />
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0 }}>Projekte</h1>
          {firmen.length > 1 ? (
            <select
              value={aktivFirma?.id ?? ''}
              onChange={(e) => setAktivFirmaId(e.target.value)}
              style={{ ...eingabeStil, marginTop: 6, fontSize: 13 }}
            >
              {firmen.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          ) : (
            <p style={{ margin: '4px 0 0', color: 'var(--ink-dim)', fontSize: 14 }}>{aktivFirma?.name}</p>
          )}
        </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
            {zeigeFormular ? 'Abbrechen' : '+ Neues Projekt'}
          </button>
          <button style={knopfSekundaerStil} onClick={() => signOut()}>Abmelden</button>
        </div>
      </header>

      {zeigeFormular && (
        <form onSubmit={projektAnlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Projektname
            <input style={eingabeStil} value={neuerName} onChange={(e) => setNeuerName(e.target.value)} required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Adresse (optional)
            {neueAdresse && (
              <div style={{ fontSize: 13, color: 'var(--ink)', padding: '8px 0' }}>{neueAdresse}</div>
            )}
            {googleAktiv ? (
              <AdresseSuche
                platzhalter="Adresse eingeben und Vorschlag auswählen …"
                onAuswahl={(a) => {
                  setNeueAdresse(a.adresse)
                  setNeueKoordinaten({ breitengrad: a.breitengrad, laengengrad: a.laengengrad })
                }}
              />
            ) : (
              <input
                style={eingabeStil}
                value={neueAdresse}
                onChange={(e) => { setNeueAdresse(e.target.value); setNeueKoordinaten(null) }}
              />
            )}
          </label>
          <button type="submit" style={knopfStil}>Projekt speichern</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Projekte …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Projekte konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && projekte.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Projekte – lege dein erstes Projekt an.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {projekte.map((p) => (
          <Link key={p.id} to={`/projekte/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ ...karteStil, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                {p.adresse && <div style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{p.adresse}</div>}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'oklch(93% 0.01 70)', color: 'var(--ink-dim)' }}>
                {projektStatusLabel[p.status] ?? p.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
