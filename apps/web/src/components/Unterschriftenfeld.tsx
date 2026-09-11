import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

// Wiederverwendbares Unterschriften-Feld: per Finger/Maus/Stift auf einem
// Canvas gezeichnet, als PNG exportierbar. Für das digitale
// Abnahmeprotokoll gebaut (Abnahme.tsx), bewusst generisch gehalten, damit
// spätere Formulare (z.B. Bedenkenanmeldung, Übergabeprotokolle) dieselbe
// Komponente nutzen können, statt die Canvas-Logik zu duplizieren.
//
// Ausdrücklich KEINE kryptografisch-rechtsverbindliche elektronische
// Signatur nach eIDAS (qualifizierte elektronische Signatur/QES) - eine
// praxisübliche, visuelle Unterschrift wie bei einer Paketzustellung.

export type UnterschriftenfeldHandle = {
  hatInhalt: () => boolean
  alsBlob: () => Promise<Blob | null>
  leeren: () => void
}

const Unterschriftenfeld = forwardRef<UnterschriftenfeldHandle, { breite?: number; hoehe?: number }>(
  function Unterschriftenfeld({ breite = 480, hoehe = 150 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const zeichnetRef = useRef(false)
    const [hatGezeichnet, setHatGezeichnet] = useState(false)

    function weissFuellen() {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    useEffect(() => { weissFuellen() }, [])

    function position(e: ReactPointerEvent<HTMLCanvasElement>) {
      const rect = e.currentTarget.getBoundingClientRect()
      const skalaX = e.currentTarget.width / rect.width
      const skalaY = e.currentTarget.height / rect.height
      return { x: (e.clientX - rect.left) * skalaX, y: (e.clientY - rect.top) * skalaY }
    }

    function start(e: ReactPointerEvent<HTMLCanvasElement>) {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      e.currentTarget.setPointerCapture(e.pointerId)
      zeichnetRef.current = true
      const { x, y } = position(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    function zeichnen(e: ReactPointerEvent<HTMLCanvasElement>) {
      if (!zeichnetRef.current) return
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      const { x, y } = position(e)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1c1a14'
      ctx.lineTo(x, y)
      ctx.stroke()
      if (!hatGezeichnet) setHatGezeichnet(true)
    }

    function ende() { zeichnetRef.current = false }

    function leeren() {
      weissFuellen()
      setHatGezeichnet(false)
    }

    useImperativeHandle(ref, () => ({
      hatInhalt: () => hatGezeichnet,
      leeren,
      alsBlob: () => new Promise((resolve) => {
        const canvas = canvasRef.current
        if (!canvas) { resolve(null); return }
        canvas.toBlob((blob) => resolve(blob), 'image/png')
      }),
    }))

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: breite }}>
        <canvas
          ref={canvasRef}
          width={breite}
          height={hoehe}
          onPointerDown={start}
          onPointerMove={zeichnen}
          onPointerUp={ende}
          onPointerLeave={ende}
          onPointerCancel={ende}
          style={{
            width: '100%', height: hoehe, borderRadius: 13, border: '1px solid var(--glass-border)',
            background: '#fff', touchAction: 'none', cursor: 'crosshair', display: 'block',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>Mit Maus, Finger oder Stift unterschreiben</span>
          {hatGezeichnet && (
            <button
              type="button"
              onClick={leeren}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)' }}
            >
              Löschen
            </button>
          )}
        </div>
      </div>
    )
  }
)

export default Unterschriftenfeld
