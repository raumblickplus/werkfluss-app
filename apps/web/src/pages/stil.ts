import type { CSSProperties } from 'react'

// "Liquid Glass" – dieselbe Designsprache wie im Klick-Prototyp (app.html):
// warmer heller Hintergrund, durchscheinende Glaskarten, Pillenknöpfe.
export const karteStil: CSSProperties = {
  background: 'var(--glass-grad)',
  backdropFilter: 'blur(26px) saturate(160%)',
  WebkitBackdropFilter: 'blur(26px) saturate(160%)',
  border: '1px solid var(--glass-border)',
  borderRadius: 24,
  padding: '20px 22px',
  boxShadow: 'var(--glass-shadow)',
}

export const eingabeStil: CSSProperties = {
  padding: '10px 13px',
  borderRadius: 13,
  border: '1px solid var(--glass-border)',
  fontSize: 12.5,
  fontFamily: 'var(--font-body)',
  background: 'rgba(255,255,255,.5)',
  color: 'var(--ink)',
}

export const knopfStil: CSSProperties = {
  padding: '10px 18px',
  borderRadius: 999,
  border: 'none',
  background: 'linear-gradient(135deg, var(--orange), var(--orange-deep))',
  color: 'oklch(20% 0.02 60)',
  fontWeight: 700,
  fontSize: 12.5,
  cursor: 'pointer',
}

export const knopfSekundaerStil: CSSProperties = {
  ...knopfStil,
  background: 'transparent',
  color: 'var(--ink-dim)',
  border: '1px solid var(--glass-border)',
}

export const projektStatusLabel: Record<string, string> = {
  planung: 'Planung',
  ausfuehrung: 'Ausführung',
  abnahme: 'Abnahme',
  abgeschlossen: 'Abgeschlossen',
  pausiert: 'Pausiert',
}

// Farbvariante je Projektstatus, passend zu den .pill-Klassen aus dem Prototyp.
export const projektStatusVariante: Record<string, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  planung: 'neutral',
  ausfuehrung: 'warn',
  abnahme: 'warn',
  abgeschlossen: 'ok',
  pausiert: 'bad',
}

const pillFarben: Record<'ok' | 'warn' | 'bad' | 'neutral', CSSProperties> = {
  ok: { background: 'oklch(60% 0.1 145 / .16)', color: 'oklch(42% 0.1 145)', border: '1px solid oklch(60% 0.1 145 / .4)' },
  warn: { background: 'oklch(70% 0.16 60 / .16)', color: 'var(--orange-text)', border: '1px solid oklch(70% 0.16 60 / .35)' },
  bad: { background: 'oklch(62% 0.19 25 / .14)', color: 'oklch(48% 0.17 27)', border: '1px solid oklch(62% 0.19 25 / .35)' },
  neutral: { background: 'rgba(40,28,14,.07)', color: 'var(--ink-dim)', border: '1px solid var(--glass-border)' },
}

export function pillStil(variante: 'ok' | 'warn' | 'bad' | 'neutral'): CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 700,
    padding: '4px 9px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
    display: 'inline-block',
    ...pillFarben[variante],
  }
}
