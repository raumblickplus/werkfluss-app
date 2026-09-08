import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { adresseZuKoordinaten } from '../lib/wetter'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import AdresseSuche, { googleAdresssucheVerfuegbar } from '../components/AdresseSuche'
import { eingabeStil, knopfStil, karteStil, projektStatusLabel, projektStatusVariante, pillStil } from './stil'

type Projekt = {
  id: string
  name: string
  status: string
  adresse: string | null
}

export default function Projekte() {
  const { aktivFirma } = useAuth()
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
    <AppShell
      title="Projekte"
      subtitle={aktivFirma?.name}
      actions={
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Neues Projekt'}
        </button>
      }
    >
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

      {projekte.length > 0 && (
        <div className="liquid row-list">
          {projekte.map((p) => (
            <Link key={p.id} to={`/projekte/${p.id}`} className="proj-row">
              <div className="nm">
                {p.name}
                {p.adresse && <span className="addr">{p.adresse}</span>}
              </div>
              <span style={pillStil(projektStatusVariante[p.status] ?? 'neutral')}>
                {projektStatusLabel[p.status] ?? p.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
