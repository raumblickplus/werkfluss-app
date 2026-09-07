import type { CSSProperties } from 'react'

export const karteStil: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 28,
  boxShadow: '0 16px 34px rgba(120,90,45,.12)',
}

export const eingabeStil: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  background: 'white',
  color: 'var(--ink)',
}

export const knopfStil: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(90deg, var(--orange), var(--orange-deep))',
  color: 'white',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
}

export const knopfSekundaerStil: CSSProperties = {
  ...knopfStil,
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--border)',
}

export const projektStatusLabel: Record<string, string> = {
  planung: 'Planung',
  ausfuehrung: 'Ausführung',
  abnahme: 'Abnahme',
  abgeschlossen: 'Abgeschlossen',
  pausiert: 'Pausiert',
}
