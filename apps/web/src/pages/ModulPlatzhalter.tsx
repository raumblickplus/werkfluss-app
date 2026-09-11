import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { karteStil } from './stil'

type ModulInfo = { titel: string; phase: string; beschreibung: string }

const module: Record<string, ModulInfo> = {
  dashboard: {
    titel: 'Dashboard',
    phase: 'Phase 1',
    beschreibung: 'Alle Projekte auf einen Blick: Termine, Kosten, offene Mängel und Aufgaben – sobald mehrere Projekte gleichzeitig laufen, ist das die Startseite statt der reinen Projektliste.',
  },
  finanzen: {
    titel: 'Finanzen',
    phase: 'Phase 1/4',
    beschreibung: 'Projektübergreifende Auswertung aus Angeboten, Aufträgen und Rechnungen (die du schon je Projekt anlegen kannst) – offene Posten, Zahlungseingänge, Marge je Projekt.',
  },
  zeitplan: {
    titel: 'Zeitplan',
    phase: 'Phase 2',
    beschreibung: 'Terminstrahl/Gantt je Projekt mit Kalender-Sync (Apple/Google/Outlook), damit Verschiebungen (Krankheit, Lieferengpässe) sofort sichtbar werden.',
  },
  tagesbericht: {
    titel: 'Tagesbericht',
    phase: 'Phase 2',
    beschreibung: 'KI-gestützte Zusammenfassung aus Bautagebuch, Mängeln und Kommunikation aller Projekte – damit du nicht jedes Projekt einzeln durchklicken musst. Das Bautagebuch je Projekt kannst du schon heute führen (Tab „Bautagebuch" im Projekt).',
  },
  maengel: {
    titel: 'Mängel & Abnahme',
    phase: 'Phase 1',
    beschreibung: 'Projektübergreifende Mängelliste inkl. Verortung auf dem Grundriss und digitalem Abnahmeprotokoll. Die Mängelliste je Projekt gibt es schon (Tab „Mängel" im Projekt).',
  },
  cadbim: {
    titel: 'CAD/BIM',
    phase: 'Phase 5',
    beschreibung: 'Anbindung an PaletteCAD, ArchiCAD und Vectorworks über die offenen Formate IFC/BCF, inklusive Web-Viewer direkt in der App.',
  },
  buchhaltung: {
    titel: 'Buchhaltung',
    phase: 'Phase 4',
    beschreibung: 'Vollständige Buchhaltung mit Bankanbindung, DATEV-Export und Mahnwesen – in Kooperation mit einem lizenzierten Partner, da Zahlungsabwicklung eine eigene Regulierungsfrage ist.',
  },
  kommunikation: {
    titel: 'Kommunikation',
    phase: 'Phase 3',
    beschreibung: 'Projektbezogener Chat, direkte Videotelefonie, Live-Übersetzung (DeepL), KI-To-Do-Vorschläge (Claude) aus dem Gesprächsverlauf und automatische KI-Protokolle aus aufgezeichneten Videobesprechungen (nur mit Zustimmung beider Seiten) kannst du schon heute nutzen (Tab „Kommunikation“ im Projekt).',
  },
  networking: {
    titel: 'Networking',
    phase: 'Phase 6',
    beschreibung: 'Offenes Matching mit Handwerkern und Planern nach dem Vorbild von MyHammer, inklusive verifizierter Referenzen aus abgeschlossenen Projekten.',
  },
  ausschreibung: {
    titel: 'Ausschreibung & LV',
    phase: 'Phase 1',
    beschreibung: 'Leistungsverzeichnisse automatisch aus VOB-/StLB-Bau-Texten vorbefüllen und Handwerker darüber finden/matchen. Positionen je Gewerk kannst du schon heute anlegen (Tab „Ausschreibung & LV" im Projekt) – die automatische Textvorbefüllung und das Matching folgen später.',
  },
  foerdermittel: {
    titel: 'Fördermittel',
    phase: 'Phase 5',
    beschreibung: 'Unverbindliche Ersteinschätzung zu KfW-/BAFA-Förderungen sowie eine Checkliste für Nachweise und Fristen kannst du schon heute nutzen (Tab „Fördermittel" im Projekt) – ausdrücklich keine Förderzusage.',
  },
  projektmappe: {
    titel: 'Projektmappe',
    phase: 'Phase 3',
    beschreibung: 'Digitale Mappe für den Bauherrn: Pläne, Moodboard, Materialmuster bestellen, 3D-Viewer – alles, was der Kunde ohne eigenes Werkfluss-Wissen sehen soll.',
  },
  team: {
    titel: 'Team',
    phase: 'Phase 1 – Datenbank steht, Oberfläche fehlt noch',
    beschreibung: 'Kolleg:innen einladen, Abteilungen und Freigabekompetenzen festlegen ("Zahlungen bis 5.000 €"). Die Firmenmitgliedschaft selbst funktioniert technisch schon, eine eigene Verwaltungsseite dafür kommt als Nächstes.',
  },
  einstellungen: {
    titel: 'Einstellungen',
    phase: '',
    beschreibung: 'Firmendaten, Rechnungslayout, Benachrichtigungen und Zugänge an einem Ort.',
  },
}

// Diese Module sind keine eigenen Seiten, sondern nur Tabs innerhalb eines
// Projekts (Kommunikation, Ausschreibung & LV, Fördermittel). Statt der
// "Noch nicht verfügbar"-Kachel zeigen wir hier eine Projektauswahl, die
// direkt zum passenden Tab springt – bei genau einem Projekt automatisch.
const PROJEKT_TAB_MODULE = new Set(['kommunikation', 'ausschreibung', 'foerdermittel'])

type ProjektKurz = { id: string; name: string; kunde_name: string | null }

export default function ModulPlatzhalter() {
  const { modulId } = useParams<{ modulId: string }>()
  const navigate = useNavigate()
  const { aktivFirma } = useAuth()
  const info = (modulId && module[modulId]) || { titel: modulId ?? 'Modul', phase: '', beschreibung: 'Noch keine Beschreibung hinterlegt.' }
  const istProjektTab = !!modulId && PROJEKT_TAB_MODULE.has(modulId)

  const [projekte, setProjekte] = useState<ProjektKurz[] | null>(null)

  useEffect(() => {
    if (!istProjektTab || !aktivFirma) return
    supabase
      .from('projekte')
      .select('id, name, kunde_name')
      .eq('firma_id', aktivFirma.id)
      .order('name')
      .then(({ data }) => setProjekte(data ?? []))
  }, [istProjektTab, aktivFirma?.id])

  useEffect(() => {
    if (istProjektTab && modulId && projekte && projekte.length === 1) {
      navigate(`/projekte/${projekte[0].id}?tab=${modulId}`, { replace: true })
    }
  }, [istProjektTab, projekte, modulId, navigate])

  if (istProjektTab) {
    return (
      <AppShell title={info.titel} subtitle="Teil eines Projekts">
        <div style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
            „{info.titel}" ist kein eigener Bereich, sondern ein Tab innerhalb eines Projekts. Wähle unten ein Projekt, um direkt dorthin zu springen.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
          {projekte === null && <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Lädt …</p>}
          {projekte && projekte.length === 0 && (
            <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Noch kein Projekt angelegt – lege zuerst ein Projekt an, dann taucht es hier auf.</p>
          )}
          {projekte?.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/projekte/${p.id}?tab=${modulId}`)}
              style={{
                ...karteStil, textAlign: 'left', cursor: 'pointer', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--glass-border)',
                font: 'inherit', color: 'inherit',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</span>
              {p.kunde_name && <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{p.kunde_name}</span>}
            </button>
          ))}
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={info.titel} subtitle={info.phase ? `Geplant für ${info.phase}` : undefined}>
      <div style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
          padding: '5px 10px', borderRadius: 999, background: 'oklch(70% 0.16 60 / .14)', border: '1px solid oklch(70% 0.16 60 / .3)',
          color: 'var(--orange-text)',
        }}>
          Noch nicht verfügbar
        </div>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-dim)', lineHeight: 1.6, maxWidth: 560 }}>
          {info.beschreibung}
        </p>
      </div>
    </AppShell>
  )
}
