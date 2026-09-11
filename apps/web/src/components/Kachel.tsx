import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Kennzahl-Kachel auf den Übersichtsseiten (Finanzen/Mängel & Abnahme/
// Zeitplan/Tagesbericht), die zu einem konkreten Projekt führt statt nur
// die Zahl anzuzeigen (Julian-Feedback 11.09.2026: erst "ich kann
// nirgendwo draufklicken", dann - nach einem ersten Versuch mit reinem
// Ankersprung zur Detail-Karte auf derselben Seite - "es passiert nichts,
// man wird nicht weitergeleitet", weil das Sprungziel oft schon sichtbar
// war). Jede Kachel bekommt jetzt ein echtes Linkziel: das erste Element
// hinter der jeweiligen Kennzahl (z.B. den dringendsten Mangel, das erste
// Projekt mit Finanzdaten) - eine Seite, zu der man wirklich navigiert.
// Existiert kein passendes Element (z.B. keine Mängel vorhanden), bleibt
// die Kachel bewusst eine reine Anzeige statt eines toten Links.
export function KachelLink({
  to, className, style, children,
}: {
  to: string | null
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  if (!to) return <div className={className} style={style}>{children}</div>
  return (
    <Link to={to} className={className} style={{ textDecoration: 'none', ...style }}>
      {children}
    </Link>
  )
}
