import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Uebersicht, { type ProjektDetails } from './projekt/Uebersicht'
import Bautagebuch from './projekt/Bautagebuch'
import Maengel from './projekt/Maengel'
import Aufgaben from './projekt/Aufgaben'

type Projekt = ProjektDetails & { breitengrad: number | null; laengengrad: number | null }
type Tab = 'uebersicht' | 'bautagebuch' | 'maengel' | 'aufgaben'

const tabs: { key: Tab; label: string }[] = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'bautagebuch', label: 'Bautagebuch' },
  { key: 'maengel', label: 'Mängel' },
  { key: 'aufgaben', label: 'Aufgaben' },
]

const PROJEKT_SPALTEN =
  'id, name, adresse, status, vorhabenart, gebaeudeklasse, start_datum, end_datum_geplant, kunde_name, kunde_kontakt, breitengrad, laengengrad'

export default function ProjektDetail() {
  const { id } = useParams<{ id: string }>()
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [fehlerText, setFehlerText] = useState<string | null>(null)
  const [aktivTab, setAktivTab] = useState<Tab>('uebersicht')

  const laden = useCallback(() => {
    if (!id) return
    setLadeStatus('laedt')
    supabase
      .from('projekte')
      .select(PROJEKT_SPALTEN)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setFehlerText(error?.message ?? 'Kein Zugriff auf dieses Projekt.')
          setLadeStatus('fehler')
          return
        }
        setProjekt(data)
        setLadeStatus('bereit')
      })
  }, [id])

  useEffect(() => { laden() }, [laden])

  if (ladeStatus === 'laedt') {
    return <div style={{ padding: 32, color: 'var(--ink-faint)' }}>Lädt …</div>
  }
  if (ladeStatus === 'fehler' || !projekt || !id) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: 'var(--red)' }}>Projekt nicht gefunden oder kein Zugriff.{fehlerText ? ` (${fehlerText})` : ''}</p>
        <Link to="/" style={{ color: 'var(--orange-text)' }}>← Zurück zu den Projekten</Link>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: 760, margin: '0 auto' }}>
      <Link to="/" style={{ color: 'var(--ink-faint)', fontSize: 13, textDecoration: 'none' }}>← Alle Projekte</Link>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: '8px 0 4px' }}>{projekt.name}</h1>
      {projekt.adresse && <p style={{ margin: '0 0 24px', color: 'var(--ink-dim)', fontSize: 14 }}>{projekt.adresse}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setAktivTab(t.key)}
            style={{
              padding: '10px 4px',
              marginRight: 20,
              background: 'none',
              border: 'none',
              borderBottom: aktivTab === t.key ? '2px solid var(--orange)' : '2px solid transparent',
              color: aktivTab === t.key ? 'var(--ink)' : 'var(--ink-faint)',
              fontWeight: aktivTab === t.key ? 700 : 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aktivTab === 'uebersicht' && <Uebersicht projekt={projekt} onAktualisiert={laden} />}
      {aktivTab === 'bautagebuch' && (
        <Bautagebuch
          projektId={id}
          adresse={projekt.adresse}
          koordinaten={
            projekt.breitengrad != null && projekt.laengengrad != null
              ? { breitengrad: projekt.breitengrad, laengengrad: projekt.laengengrad }
              : null
          }
        />
      )}
      {aktivTab === 'maengel' && <Maengel projektId={id} />}
      {aktivTab === 'aufgaben' && <Aufgaben projektId={id} />}
    </div>
  )
}
