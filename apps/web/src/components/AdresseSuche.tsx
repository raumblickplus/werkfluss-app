import { useEffect, useRef, useState } from 'react'

// Lädt die Google Maps JS API (Places-Bibliothek) einmalig, egal wie viele
// AdresseSuche-Instanzen auf der Seite sind.
let ladePromise: Promise<void> | null = null

function googleMapsLaden(apiKey: string): Promise<void> {
  const win = window as unknown as { google?: { maps?: { importLibrary?: unknown } } }
  if (win.google?.maps?.importLibrary) return Promise.resolve()
  if (ladePromise) return ladePromise

  ladePromise = new Promise((resolve, reject) => {
    const callbackName = '__werkflussGoogleMapsBereit'
    ;(window as unknown as Record<string, unknown>)[callbackName] = () => resolve()
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=${callbackName}`
    script.async = true
    script.onerror = () => reject(new Error('Google Maps konnte nicht geladen werden'))
    document.head.appendChild(script)
  })
  return ladePromise
}

export type AdressAuswahl = { adresse: string; breitengrad: number; laengengrad: number }

export function googleAdresssucheVerfuegbar(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
}

export default function AdresseSuche({
  onAuswahl,
  platzhalter = 'Adresse eingeben und Vorschlag auswählen …',
}: {
  onAuswahl: (a: AdressAuswahl) => void
  platzhalter?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) { setStatus('fehler'); return }
    let abgebrochen = false

    googleMapsLaden(apiKey)
      .then(async () => {
        if (abgebrochen || !containerRef.current) return
        const google = (window as unknown as { google: any }).google
        const { PlaceAutocompleteElement } = await google.maps.importLibrary('places')
        const element = new PlaceAutocompleteElement({ includedRegionCodes: ['de'] })
        element.placeholder = platzhalter
        containerRef.current.innerHTML = ''
        containerRef.current.appendChild(element)

        element.addEventListener('gmp-select', async (event: any) => {
          const place = event.placePrediction.toPlace()
          await place.fetchFields({ fields: ['formattedAddress', 'location'] })
          if (place.location) {
            onAuswahl({
              adresse: place.formattedAddress ?? '',
              breitengrad: place.location.lat(),
              laengengrad: place.location.lng(),
            })
          }
        })

        if (!abgebrochen) setStatus('bereit')
      })
      .catch(() => { if (!abgebrochen) setStatus('fehler') })

    return () => { abgebrochen = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === 'fehler') return null
  return <div ref={containerRef} style={{ minHeight: 42 }} />
}
