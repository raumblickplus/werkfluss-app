import type { CSSProperties } from 'react'

// Flaechiges Blockfarben-Design: warmer heller Hintergrund, feste
// Kartenflaechen ohne Weichzeichner, klare Farbfelder statt Farbverlaeufe.
export const karteStil: CSSProperties = {
  background: 'var(--glass-grad)',
  border: '1px solid var(--glass-border)',
  borderRadius: 20,
  padding: '20px 22px',
  boxShadow: 'var(--glass-shadow)',
}

export const eingabeStil: CSSProperties = {
  padding: '10px 13px',
  borderRadius: 13,
  border: '1px solid var(--glass-border)',
  fontSize: 12.5,
  fontFamily: 'var(--font-body)',
  background: 'var(--surface-raised)',
  color: 'var(--ink)',
}

export const knopfStil: CSSProperties = {
  padding: '10px 18px',
  borderRadius: 999,
  border: 'none',
  background: 'var(--orange)',
  color: 'var(--on-accent)',
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
  ok: { background: 'color-mix(in oklab, #3F7D4A 16%, transparent)', color: '#2B5A34', border: '1px solid color-mix(in oklab, #3F7D4A 40%, transparent)' },
  warn: { background: 'color-mix(in oklab, var(--orange) 16%, transparent)', color: 'var(--orange-text)', border: '1px solid color-mix(in oklab, var(--orange) 38%, transparent)' },
  bad: { background: 'color-mix(in oklab, var(--red) 15%, transparent)', color: 'var(--red)', border: '1px solid color-mix(in oklab, var(--red) 38%, transparent)' },
  neutral: { background: 'rgba(23,20,14,.07)', color: 'var(--ink-dim)', border: '1px solid var(--glass-border)' },
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

// Flaechige Farbblock-Kachel (grosse Dashboard-Kacheln im Stil der
// Referenzbilder): jede Variante liefert Hintergrund + passende Textfarbe,
// die Groesse/Zahl kommt aus der aufrufenden Seite via className "block-num" etc.
export type BlockVariante = 'olive-deep' | 'olive' | 'terracotta' | 'sage' | 'mustard' | 'cream' | 'dark'

export function blockKlasse(variante: BlockVariante): string {
  return `block ${variante}`
}
