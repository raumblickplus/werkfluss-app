// Marken-Baustein: das ursprüngliche Wellen-Logo (helles Kärtchen mit
// oranger Welle), einheitlich auf allen Bildschirmen inkl. Sidebar –
// optional mit dem Schriftzug "Werkfluss" daneben.
export default function Marke({ mitWort = false, groesse = 36 }: { mitWort?: boolean; groesse?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: groesse,
          height: groesse,
          borderRadius: groesse * 0.28,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 20px rgba(20,14,6,.28)',
          flexShrink: 0,
        }}
      >
        <svg width={groesse * 0.53} height={groesse * 0.14} viewBox="0 0 360 90">
          <path
            d="M20 60 L45 30 L70 60 L95 30 Q140 15 175 45 Q210 75 250 45 Q285 20 330 45"
            fill="none"
            stroke="var(--orange-deep)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {mitWort && (
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: groesse * 0.47, color: 'var(--ink)' }}>Werkfluss</span>
      )}
    </div>
  )
}
