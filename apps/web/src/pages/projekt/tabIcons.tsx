import type { ReactNode } from 'react'

// Kleine, einheitliche Icon-Reihe für die Projekt-Reiter und ihre Gruppen
// (Julian-Feedback 11.09.2026: "die Reiter brauchen Icons"). Bewusst im
// selben Strichzeichnungs-Stil wie die Sidebar-Icons in AppShell.tsx
// (viewBox 24x24, strokeWidth 1.8, runde Kappen) gehalten, aber als eigene,
// kleinere Reihe statt die Sidebar-Icons zu importieren - die Sidebar
// beschreibt App-weite Module ("Finanzen", "Zeitplan"), diese hier
// konkrete Projekt-Funktionen (Angebote, Rechnungen, Bautagebuch, ...),
// eine 1:1-Wiederverwendung würde beim Betrachten der Sidebar UND der
// Projekt-Reiter nebeneinander eher verwirren als helfen.

function Svg({ children, groesse = 15 }: { children: ReactNode; groesse?: number }) {
  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const tabIcons: Record<string, ReactNode> = {
  uebersicht: (
    <Svg>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  ausschreibung: (
    <Svg>
      <path d="M7 3.5h8l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 12.5h6M9 16h6" />
    </Svg>
  ),
  kommunikation: (
    <Svg>
      <path d="M21 11.5a7.5 7.5 0 0 1-11.4 6.4L4 19l1.2-4.6A7.5 7.5 0 1 1 21 11.5Z" />
    </Svg>
  ),
  angebote: (
    <Svg>
      <path d="M12.5 3.5H19a1 1 0 0 1 1 1v6.5a1 1 0 0 1-.3.7l-8.4 8.4a1 1 0 0 1-1.4 0l-6.5-6.5a1 1 0 0 1 0-1.4l8.4-8.4a1 1 0 0 1 .7-.3Z" />
      <path d="M16 8.5h.01" />
    </Svg>
  ),
  bautagebuch: (
    <Svg>
      <path d="M4 5.5c2.5-1 5-1 8 .5v13c-3-1.5-5.5-1.5-8-.5v-13Z" />
      <path d="M20 5.5c-2.5-1-5-1-8 .5v13c3-1.5 5.5-1.5 8-.5v-13Z" />
    </Svg>
  ),
  maengel: (
    <Svg>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </Svg>
  ),
  aufgaben: (
    <Svg>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
    </Svg>
  ),
  abnahme: (
    <Svg>
      <path d="M12 3.5 19 6v6c0 5-3 8-7 9.5-4-1.5-7-4.5-7-9.5V6l7-2.5Z" />
      <path d="m9 12.5 2 2 4-4.5" />
    </Svg>
  ),
  faelle: (
    <Svg>
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-10Z" />
      <path d="M12 12v2.5M12 16.5h.01" />
    </Svg>
  ),
  rechnungen: (
    <Svg>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M14 8c-.6-.5-1.3-.8-2-.8-1.6 0-2.8 1.3-2.8 3.3v3c0 2 1.2 3.3 2.8 3.3.7 0 1.4-.3 2-.8M8.7 10.2h3.6M8.7 12.3h3" />
    </Svg>
  ),
  foerdermittel: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 15 6-6M9 9h.01M15 15h.01" />
    </Svg>
  ),
  genehmigungen: (
    <Svg>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M8.5 13.8 7 21l5-3 5 3-1.5-7.2" />
    </Svg>
  ),
  technik: (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </Svg>
  ),
  stundenzettel: (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </Svg>
  ),
  dokumente: (
    <Svg>
      <path d="M7 3.5h8l4 4V17a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M5 7.5v13a1 1 0 0 0 1 1h10" />
    </Svg>
  ),
  spesen: (
    <Svg>
      <path d="M4 8.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <path d="M8 8.5V6a2.5 2.5 0 0 1 2.5-2.5h3A2.5 2.5 0 0 1 16 6v2.5" />
      <path d="M3 13h18" />
    </Svg>
  ),
  leistungsphasen: (
    <Svg>
      <path d="M4 20V15M9.5 20V11M15 20V7M20 20V3.5" />
    </Svg>
  ),
  bedenken: (
    <Svg>
      <path d="M6 21V4M6 4h11l-2.5 3.5L17 11H6" />
    </Svg>
  ),
}

export const gruppenIcons: Record<string, ReactNode> = {
  Planung: (
    <Svg>
      <path d="M12 3v3M7 21l5-15 5 15M9 16h6" />
    </Svg>
  ),
  Ausführung: (
    <Svg>
      <path d="m14 6 4 4-8.5 8.5a2 2 0 0 1-2.8 0l-1.2-1.2a2 2 0 0 1 0-2.8L14 6Z" />
      <path d="m17 3 4 4" />
    </Svg>
  ),
  Abrechnung: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 8.5c-.8-.6-1.7-1-2.8-1-2.3 0-4.2 1.9-4.2 4.5s1.9 4.5 4.2 4.5c1.1 0 2-.4 2.8-1M7 10.5h6M7 13.5h5" />
    </Svg>
  ),
  Abschluss: (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9" />
    </Svg>
  ),
}
