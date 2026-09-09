import { useState } from 'react'
import Marke from '../components/Marke'
import FirmaAnlegen from './FirmaAnlegen'
import HerstellerAnlegen from './HerstellerAnlegen'
import { karteStil, knopfStil, knopfSekundaerStil } from './stil'

type Wahl = 'offen' | 'firma' | 'hersteller'

// Erster Schritt für jede Person ohne bestehende Mitgliedschaft (weder
// Firma noch Bauherr-Projekt noch Hersteller, siehe App.tsx): welcher
// Account-Typ soll angelegt werden? Bauherr-Accounts entstehen weiterhin
// ausschließlich über eine Projekteinladung (EinladungAnnehmen.tsx), nicht
// hier - nur Baufirma/Handwerksbetrieb und Hersteller/Lieferant sind
// selbst registrierbar (0024_hersteller_lieferanten.sql).
export default function KontoTypWahl() {
  const [wahl, setWahl] = useState<Wahl>('offen')

  if (wahl === 'firma') return <FirmaAnlegen />
  if (wahl === 'hersteller') return <HerstellerAnlegen onZurueck={() => setWahl('offen')} />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
      <Marke mitWort groesse={34} />
      <div style={{ ...karteStil, width: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>Wie möchtest du Werkfluss nutzen?</h1>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-dim)', fontSize: 13.5 }}>
            Du bist noch keinem Account-Typ zugeordnet. Wähle, wofür du Werkfluss einsetzen möchtest.
          </p>
        </div>
        <button style={knopfStil} onClick={() => setWahl('firma')}>
          Baufirma / Handwerksbetrieb anlegen
        </button>
        <button style={knopfSekundaerStil} onClick={() => setWahl('hersteller')}>
          Hersteller / Lieferant werden
        </button>
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-faint)' }}>
          Bist du Bauherr:in? Du brauchst hier nichts anzulegen – sobald dich dein Bauunternehmen oder Handwerksbetrieb über
          einen Einladungslink hinzufügt, öffnet sich deine Ansicht automatisch.
        </p>
      </div>
    </div>
  )
}
