import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AppShell from '../components/AppShell'
import Uebersicht, { type ProjektDetails } from './projekt/Uebersicht'
import Angebote from './projekt/Angebote'
import Bautagebuch from './projekt/Bautagebuch'
import Maengel from './projekt/Maengel'
import Aufgaben from './projekt/Aufgaben'
import Rechnungen from './projekt/Rechnungen'
import { projektStatusLabel, projektStatusVariante, pillStil } from './stil'

type Projekt = ProjektDetails & { breitengrad: number | null; laengengrad: number | null }
type Tab = 'uebersicht' | 'angebote' | 'bautagebuch' | 'maengel' | 'aufgaben' | 'rechnungen'

const tabs: { key: Tab; label: string }[] = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'angebote', label: 'Angebote' },
  { key: 'bautagebuch', label: 'Bautagebuch' },
  { key: 'maengel', label: 'Mängel' },
  { key: 'aufgaben', label: 'Aufgaben' },
  { key: 'rechnungen', label: 'Rechnungen' },
]

const PROJEKT_SPALTEN =
  'id, name, adresse, status, vorhabenart, gebaeudeklasse, kunde_name, kunde_kontakt, kunde_rechnungsadresse, breitengrad, laengengrad'

export default function ProjektDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [fehlerText, setFehlerText] = useState<string | null>(null)
  const tabAusUrl = searchParams.get('tab') as Tab | null
  const [aktivTab, setAktivTab] = useState<Tab>(
    tabAusUrl && tabs.some((t) => t.key === tabAusUrl) ? tabAusUrl : 'uebersicht'
  )

  function tabWechseln(tab: Tab) {
    setAktivTab(tab)
    setSearchParams(tab === 'uebersicht' ? {} : { tab }, { replace: true })
  }

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
    <AppShell
      title={projekt.name}
      subtitle={
        <>
          <Link to="/" style={{ color: 'var(--ink-faint)', textDecoration: 'none' }}>← Alle Projekte</Link>
          {projekt.adresse ? ` · ${projekt.adresse}` : ''}
        </>
      }
      actions={
        <span style={pillStil(projektStatusVariante[projekt.status] ?? 'neutral')}>
          {projektStatusLabel[projekt.status] ?? projekt.status}
        </span>
      }
    >
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab${aktivTab === t.key ? ' active' : ''}`}
            onClick={() => tabWechseln(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aktivTab === 'uebersicht' && <Uebersicht projekt={projekt} onAktualisiert={laden} />}
      {aktivTab === 'angebote' && <Angebote projektId={id} />}
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
      {aktivTab === 'rechnungen' && <Rechnungen projektId={id} />}
    </AppShell>
  )
}
