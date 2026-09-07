export default function Logo({ size = 64 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 16px 34px rgba(120,90,45,.18)',
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.53} height={size * 0.14} viewBox="0 0 360 90">
        <path
          d="M20 60 L45 30 L70 60 L95 30 Q140 15 175 45 Q210 75 250 45 Q285 20 330 45"
          fill="none"
          stroke="oklch(62% 0.17 52)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
