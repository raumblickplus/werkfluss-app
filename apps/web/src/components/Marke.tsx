// Marken-Baustein aus dem Design-Prototyp (app.html): ein Quadrat mit
// Farbverlauf und "W", optional mit dem Schriftzug "Werkfluss" daneben.
// Ersetzt das frühere Wellen-Logo, damit die echte App genau wie der
// abgestimmte Klick-Prototyp aussieht.
export default function Marke({ mitWort = false, groesse = 36 }: { mitWort?: boolean; groesse?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: groesse,
          height: groesse,
          borderRadius: groesse * 0.33,
          background: 'linear-gradient(155deg, var(--olive-light), var(--olive))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: groesse * 0.44,
          color: 'oklch(97% 0.01 90)',
          boxShadow: '0 4px 12px rgba(0,0,0,.3)',
          flexShrink: 0,
        }}
      >
        W
      </div>
      {mitWort && (
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: groesse * 0.47 }}>Werkfluss</span>
      )}
    </div>
  )
}
