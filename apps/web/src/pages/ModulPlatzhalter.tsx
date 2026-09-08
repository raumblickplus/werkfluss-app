import { useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
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
    beschreibung: 'Projektbezogener Chat mit automatischer Protokollierung und Live-Übersetzung/Untertiteln für internationale Teams, statt dass Absprachen in WhatsApp verschwinden.',
  },
  networking: {
    titel: 'Networking',
    phase: 'Phase 6',
    beschreibung: 'Offenes Matching mit Handwerkern und Planern nach dem Vorbild von MyHammer, inklusive verifizierter Referenzen aus abgeschlossenen Projekten.',
  },
  ausschreibung: {
    titel: 'Ausschreibung & LV',
    phase: 'Phase 1',
    beschreibung: 'Leistungsverzeichnisse automatisch aus VOB-/StLB-Bau-Texten vorbefüllen und Handwerker darüber finden/matchen – der Schritt vor dem Angebot, das du schon je Projekt anlegen kannst.',
  },
  foerdermittel: {
    titel: 'Fördermittel',
    phase: 'Phase 5',
    beschreibung: 'Unverbindliche Ersteinschätzung zu KfW-/BAFA-Förderungen und Nachweisführung – ausdrücklich keine Förderzusage, siehe die rechtlichen Rahmenbedingungen im Konzept.',
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

export default function ModulPlatzhalter() {
  const { modulId } = useParams<{ modulId: string }>()
  const info = (modulId && module[modulId]) || { titel: modulId ?? 'Modul', phase: '', beschreibung: 'Noch keine Beschreibung hinterlegt.' }

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
