import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import Uebersicht, { type ProjektDetails } from './projekt/Uebersicht'
import Ausschreibung from './projekt/Ausschreibung'
import Kommunikation from './projekt/Kommunikation'
import Angebote from './projekt/Angebote'
import Subunternehmer from './projekt/Subunternehmer'
import Bautagebuch from './projekt/Bautagebuch'
import Maengel from './projekt/Maengel'
import Aufgaben from './projekt/Aufgaben'
import Abnahme from './projekt/Abnahme'
import Rechnungen from './projekt/Rechnungen'
import Foerdermittel from './projekt/Foerdermittel'
import Faelle from './projekt/Faelle'
import Genehmigungen from './projekt/Genehmigungen'
import TechnikHub from './projekt/TechnikHub'
import Stundenzettel from './projekt/Stundenzettel'
import SpesenUnterbringung from './projekt/SpesenUnterbringung'
import Dokumente from './projekt/Dokumente'
import Leistungsphasen from './projekt/Leistungsphasen'
import Bedenkenanmeldungen from './projekt/Bedenkenanmeldungen'
import { tabIcons, gruppenIcons } from './projekt/tabIcons'
import { projektStatusLabel, projektStatusVariante, pillStil } from './stil'

type Projekt = ProjektDetails & { firma_id: string; breitengrad: number | null; laengengrad: number | null }
type Tab = 'uebersicht' | 'ausschreibung' | 'kommunikation' | 'angebote' | 'subunternehmer' | 'bautagebuch' | 'maengel' | 'aufgaben' | 'abnahme' | 'faelle' | 'rechnungen' | 'foerdermittel' | 'genehmigungen' | 'technik' | 'stundenzettel' | 'spesen' | 'dokumente' | 'leistungsphasen' | 'bedenken'

const tabs: { key: Tab; label: string }[] = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'ausschreibung', label: 'Ausschreibung & LV' },
  { key: 'kommunikation', label: 'Kommunikation' },
  { key: 'angebote', label: 'Angebote' },
  { key: 'subunternehmer', label: 'Subunternehmer' },
  { key: 'bautagebuch', label: 'Bautagebuch' },
  { key: 'maengel', label: 'Mängel' },
  { key: 'aufgaben', label: 'Aufgaben' },
  { key: 'abnahme', label: 'Abnahme' },
  { key: 'faelle', label: 'Fälle' },
  { key: 'rechnungen', label: 'Rechnungen' },
  { key: 'foerdermittel', label: 'Fördermittel' },
  { key: 'genehmigungen', label: 'Genehmigungen' },
  { key: 'technik', label: 'Technik/Material' },
  { key: 'stundenzettel', label: 'Stundenzettel' },
  { key: 'spesen', label: 'Spesen & Unterbringung' },
  { key: 'dokumente', label: 'Pläne & Dokumente' },
  { key: 'leistungsphasen', label: 'Leistungsphasen' },
  { key: 'bedenken', label: 'Bedenkenanmeldung' },
]

// Julian-Feedback (11.09.2026): 16 flache Reiter in einer Zeile waren
// unübersichtlich geworden - mit jedem neuen Kern-Workflow-Feature kam ein
// weiterer Reiter dazu, ohne dass die Navigation je neu geordnet wurde.
// Übersicht und Kommunikation bleiben als einzige, immer sichtbare
// Standalone-Reiter bestehen (am häufigsten gebraucht); der Rest gruppiert
// sich nach Bauphase/Themenblock, aufklappbar per Klick auf die
// Gruppen-Überschrift - dieselben 14 Ziele bleiben erreichbar, nur nicht
// mehr alle gleichzeitig sichtbar. Bewusst noch keine Icons oder frei
// konfigurierbaren Widgets (Julians zweiter Vorschlag) - das wäre eine
// größere, eigene Ausbaustufe.
type TabGruppe = { label: string; tabs: Tab[] }
const tabGruppen: TabGruppe[] = [
  { label: 'Planung', tabs: ['ausschreibung', 'leistungsphasen', 'genehmigungen', 'foerdermittel'] },
  { label: 'Ausführung', tabs: ['bautagebuch', 'aufgaben', 'maengel', 'bedenken', 'technik', 'stundenzettel', 'spesen', 'dokumente'] },
  { label: 'Abrechnung', tabs: ['angebote', 'subunternehmer', 'rechnungen'] },
  { label: 'Abschluss', tabs: ['abnahme', 'faelle'] },
]
function labelVon(key: Tab) {
  return tabs.find((t) => t.key === key)?.label ?? key
}

const PROJEKT_SPALTEN =
  'id, firma_id, name, adresse, status, vorhabenart, gebaeudeklasse, kunde_name, kunde_kontakt, kunde_rechnungsadresse, start_datum, end_datum_geplant, breitengrad, laengengrad'

export default function ProjektDetail() {
  const { aktivFirma } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [fehlerText, setFehlerText] = useState<string | null>(null)
  const tabAusUrl = searchParams.get('tab') as Tab | null
  const [aktivTab, setAktivTab] = useState<Tab>(
    tabAusUrl && tabs.some((t) => t.key === tabAusUrl) ? tabAusUrl : 'uebersicht'
  )

  // Bugfix (11.09.2026, Julian-Meldung): dieselbe Seite bleibt gemountet,
  // wenn man z.B. aus dem Tagesbericht oder Zeitplan per Link auf einen
  // bestimmten Tab eines Projekts springt, das schon offen ist (oder ein
  // anderes Projekt bei gleichbleibender Tab-Struktur öffnet) - react-router
  // ändert dann nur den :id-Parameter bzw. den Query-String, ohne die
  // Komponente neu zu erzeugen. Der useState-Initialwert oben griff nur beim
  // allerersten Laden, danach ist ein Klick auf einen Tab-Link von außen
  // sichtbar ins Leere gelaufen (es blieb auf dem zuletzt aktiven Tab).
  useEffect(() => {
    setAktivTab(tabAusUrl && tabs.some((t) => t.key === tabAusUrl) ? tabAusUrl : 'uebersicht')
  }, [tabAusUrl])

  const [offeneGruppe, setOffeneGruppe] = useState<string | null>(null)
  useEffect(() => {
    setOffeneGruppe(tabGruppen.find((g) => g.tabs.includes(aktivTab))?.label ?? null)
  }, [aktivTab])

  // Der Eigentümer (GU, projekte.firma_id) sieht/verwaltet alles im Projekt.
  // Ein eingeladener Teilnehmer (Handwerker, Architekt, Subunternehmer) ist
  // hier nur Gast und bekommt entsprechend eingeschränkte Rechte (siehe
  // Migration 0019_projekt_rechte.sql) - die Rechnungen an den Bauherrn
  // gehen ihn z.B. gar nichts an, deshalb fällt der Tab für ihn ganz weg.
  const istEigentuemer = !!aktivFirma && projekt?.firma_id === aktivFirma.id
  const sichtbareTabs = istEigentuemer ? tabs : tabs.filter((t) => t.key !== 'rechnungen')

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
        <button
          className={`tab${aktivTab === 'uebersicht' ? ' active' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => tabWechseln('uebersicht')}
        >
          {tabIcons.uebersicht}
          Übersicht
        </button>
        {tabGruppen.map((g) => {
          const sichtbareGruppenTabs = g.tabs.filter((k) => sichtbareTabs.some((t) => t.key === k))
          if (sichtbareGruppenTabs.length === 0) return null
          const aktivInGruppe = sichtbareGruppenTabs.includes(aktivTab)
          const offen = offeneGruppe === g.label
          return (
            <button
              key={g.label}
              className={`tab${aktivInGruppe ? ' active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setOffeneGruppe(offen ? null : g.label)}
            >
              {gruppenIcons[g.label]}
              {g.label} {offen ? '▲' : '▼'}
            </button>
          )
        })}
        <button
          className={`tab${aktivTab === 'kommunikation' ? ' active' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => tabWechseln('kommunikation')}
        >
          {tabIcons.kommunikation}
          Kommunikation
        </button>
      </div>

      {offeneGruppe && (
        <div className="tabs" style={{ marginTop: -14, marginBottom: 20, paddingLeft: 10, borderBottom: 'none' }}>
          {tabGruppen
            .find((g) => g.label === offeneGruppe)!
            .tabs.filter((k) => sichtbareTabs.some((t) => t.key === k))
            .map((k) => (
              <button
                key={k}
                className={`tab${aktivTab === k ? ' active' : ''}`}
                style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => tabWechseln(k)}
              >
                {tabIcons[k]}
                {labelVon(k)}
              </button>
            ))}
        </div>
      )}

      {aktivTab === 'uebersicht' && <Uebersicht projekt={projekt} onAktualisiert={laden} />}
      {aktivTab === 'ausschreibung' && <Ausschreibung projektId={id} istEigentuemer={istEigentuemer} />}
      {aktivTab === 'kommunikation' && <Kommunikation projektId={id} />}
      {aktivTab === 'angebote' && <Angebote projektId={id} istEigentuemer={istEigentuemer} />}
      {aktivTab === 'subunternehmer' && <Subunternehmer projektId={id} />}
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
      {aktivTab === 'maengel' && <Maengel projektId={id} istEigentuemer={istEigentuemer} />}
      {aktivTab === 'aufgaben' && <Aufgaben projektId={id} istEigentuemer={istEigentuemer} />}
      {aktivTab === 'abnahme' && <Abnahme projektId={id} />}
      {aktivTab === 'faelle' && <Faelle projektId={id} istEigentuemer={istEigentuemer} />}
      {aktivTab === 'rechnungen' && istEigentuemer && <Rechnungen projektId={id} />}
      {aktivTab === 'foerdermittel' && (
        <Foerdermittel projektId={id} istEigentuemer={istEigentuemer} vorhabenart={projekt.vorhabenart} />
      )}
      {aktivTab === 'genehmigungen' && <Genehmigungen projektId={id} istEigentuemer={istEigentuemer} />}
      {aktivTab === 'technik' && <TechnikHub projektId={id} />}
      {aktivTab === 'stundenzettel' && <Stundenzettel projektId={id} />}
      {aktivTab === 'spesen' && <SpesenUnterbringung projektId={id} />}
      {aktivTab === 'dokumente' && <Dokumente projektId={id} />}
      {aktivTab === 'leistungsphasen' && <Leistungsphasen projektId={id} istEigentuemer={istEigentuemer} />}
      {aktivTab === 'bedenken' && <Bedenkenanmeldungen projektId={id} istEigentuemer={istEigentuemer} />}
    </AppShell>
  )
}
