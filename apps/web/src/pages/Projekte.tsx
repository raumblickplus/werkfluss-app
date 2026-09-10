import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
  kunde_name: string | null
  foto_url: string | null
}

// Platzhalterfarben fuer Projekte ohne Foto - dieselbe Farbblock-Palette
// wie die Dashboard-Kacheln, damit die Liste auch ohne Fotos stimmig wirkt.
const FOTO_PLATZHALTER = [
  { bg: '#3F4433', farbe: '#F7F3E7' },
  { bg: 'var(--olive)', farbe: 'var(--on-accent)' },
  { bg: 'var(--orange)', farbe: 'var(--on-accent)' },
  { bg: 'var(--olive-light)', farbe: 'var(--on-accent)' },
  { bg: 'var(--sand)', farbe: '#2A2410' },
  { bg: '#17150F', farbe: '#F3EFE2' },
]
function platzhalterFuer(index: number) {
  return FOTO_PLATZHALTER[index % FOTO_PLATZHALTER.length]
}
function initialen(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

export default function Projekte() {
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [neuerName, setNeuerName] = useState('')
  const [neueAdresse, setNeueAdresse] = useState('')
  const [neueKoordinaten, setNeueKoordinaten] = useState<{ breitengrad: number; laengengrad: number } | null>(null)
  const [neuesFoto, setNeuesFoto] = useState<File | null>(null)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const googleAktiv = googleAdresssucheVerfuegbar()

  async function ladeProjekte() {
    if (!aktivFirma) return
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('projekte')
      .select('id, name, status, adresse, kunde_name, foto_url')
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
    setWirdGespeichert(true)

    const koordinaten = neueKoordinaten ?? (neueAdresse ? await adresseZuKoordinaten(neueAdresse) : null)

    let fotoUrl: string | null = null
    if (neuesFoto) {
      const endung = neuesFoto.name.split('.').pop() || 'jpg'
      const pfad = `${aktivFirma.id}/${crypto.randomUUID()}.${endung}`
      const { error: uploadFehler } = await supabase.storage.from('projektfotos').upload(pfad, await neuesFoto.arrayBuffer(), {
        contentType: neuesFoto.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      })
      if (!uploadFehler) {
        fotoUrl = supabase.storage.from('projektfotos').getPublicUrl(pfad).data.publicUrl
      }
    }

    const { error } = await supabase.from('projekte').insert({
      firma_id: aktivFirma.id,
      name: neuerName,
      adresse: neueAdresse || null,
      breitengrad: koordinaten?.breitengrad ?? null,
      laengengrad: koordinaten?.laengengrad ?? null,
      foto_url: fotoUrl,
    })
    setWirdGespeichert(false)
    if (!error) {
      setNeuerName('')
      setNeueAdresse('')
      setNeueKoordinaten(null)
      setNeuesFoto(null)
      setZeigeFormular(false)
      ladeProjekte()
    }
  }

  const statusZaehler = useMemo(() => {
    const z: Record<string, number> = { planung: 0, ausfuehrung: 0, abnahme: 0, abgeschlossen: 0, pausiert: 0 }
    for (const p of projekte) z[p.status] = (z[p.status] ?? 0) + 1
    return z
  }, [projekte])
  const aktiveProjekte = statusZaehler.ausfuehrung + statusZaehler.abnahme

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
      {ladeStatus === 'bereit' && projekte.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 22 }}>
          <div className="block olive-deep" style={{ gridColumn: 'span 7', minWidth: 260 }}>
            <div className="block-ticks" />
            <div className="block-lbl">Projekte gesamt</div>
            <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{projekte.length}</div>
            <div className="block-sub">{aktiveProjekte} in Ausführung/Abnahme</div>
          </div>
          <div className={`block ${statusZaehler.pausiert > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 5', minWidth: 220 }}>
            <div className="block-lbl">{statusZaehler.pausiert > 0 ? 'Pausierte Projekte' : 'Abgeschlossen'}</div>
            <div className="block-num" style={{ fontSize: 'clamp(28px, 3vw, 44px)' }}>
              {statusZaehler.pausiert > 0 ? statusZaehler.pausiert : statusZaehler.abgeschlossen}
            </div>
            <div className="block-sub">{statusZaehler.pausiert > 0 ? 'brauchen einen Blick, warum sie stehen' : 'erfolgreich abgeschlossen'}</div>
          </div>

          <div className="block mustard" style={{ gridColumn: 'span 3', minWidth: 150 }}>
            <div className="block-lbl">In Planung</div>
            <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{statusZaehler.planung}</div>
          </div>
          <div className="block olive" style={{ gridColumn: 'span 3', minWidth: 150 }}>
            <div className="block-lbl">In Ausführung</div>
            <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{statusZaehler.ausfuehrung}</div>
          </div>
          <div className="block cream" style={{ gridColumn: 'span 3', minWidth: 150 }}>
            <div className="block-lbl">Abnahme</div>
            <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{statusZaehler.abnahme}</div>
          </div>
          <div className="block dark" style={{ gridColumn: 'span 3', minWidth: 150 }}>
            <div className="block-lbl">Abgeschlossen</div>
            <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{statusZaehler.abgeschlossen}</div>
          </div>
        </div>
      )}

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
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Projektfoto (optional)
            <input
              style={eingabeStil}
              type="file"
              accept="image/*"
              onChange={(e) => setNeuesFoto(e.target.files?.[0] ?? null)}
            />
          </label>
          <button type="submit" style={knopfStil} disabled={wirdGespeichert}>
            {wirdGespeichert ? 'Speichert …' : 'Projekt speichern'}
          </button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Projekte …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Projekte konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && projekte.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Projekte – lege dein erstes Projekt an.</p>
      )}

      {projekte.length > 0 && (
        <div className="projekt-grid">
          {projekte.map((p, i) => {
            const platzhalter = platzhalterFuer(i)
            return (
              <Link key={p.id} to={`/projekte/${p.id}`} className="projekt-kachel">
                <div
                  className="projekt-kachel-bild"
                  style={!p.foto_url ? { background: platzhalter.bg, color: platzhalter.farbe } : undefined}
                >
                  {p.foto_url ? (
                    <img src={p.foto_url} alt={p.name} />
                  ) : (
                    <span className="projekt-kachel-initialen">{initialen(p.name)}</span>
                  )}
                  <span className="projekt-kachel-status" style={pillStil(projektStatusVariante[p.status] ?? 'neutral')}>
                    {projektStatusLabel[p.status] ?? p.status}
                  </span>
                </div>
                <div className="projekt-kachel-info">
                  <div className="projekt-kachel-name">{p.name}</div>
                  {(p.kunde_name || p.adresse) && (
                    <div className="projekt-kachel-sub">{[p.kunde_name, p.adresse].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
