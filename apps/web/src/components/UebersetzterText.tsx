import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Sprachliste für die durchgängige Text-Übersetzung (Konzept Abschnitt 8.3)
// und für die manuelle Chat-Übersetzung in Kommunikation.tsx (dort als
// eigene, unveränderte Kopie belassen, um die funktionierende Live-Call-
// Datei nicht anzufassen) - dieselben zehn DeepL-Zielsprachen, gezielt für
// die im Konzept genannte Zielgruppe (Handwerker/Subunternehmer aus PL/UA/
// Kosovo/Baltikum).
export const SPRACHEN: { code: string; label: string }[] = [
  { code: 'DE', label: 'Deutsch' },
  { code: 'EN', label: 'Englisch' },
  { code: 'TR', label: 'Türkisch' },
  { code: 'PL', label: 'Polnisch' },
  { code: 'RO', label: 'Rumänisch' },
  { code: 'RU', label: 'Russisch' },
  { code: 'UK', label: 'Ukrainisch' },
  { code: 'IT', label: 'Italienisch' },
  { code: 'FR', label: 'Französisch' },
  { code: 'ES', label: 'Spanisch' },
]

type Feld = 'taetigkeiten' | 'besonderheiten'

// Zeigt einen Bautagebuch-Text automatisch in der bevorzugten Sprache des
// Betrachters an (Konzept 8.3: "durchgängige automatische Übersetzung in
// die vom jeweiligen Nutzer hinterlegte Sprache" - bewusst automatisch,
// anders als der manuelle Übersetzen-Klick im Chat). Übersetzt nur, wenn
// zielsprache != 'DE', und cacht das Ergebnis je Eintrag+Sprache in
// bautagebuch_uebersetzungen, damit nicht jede Person mit derselben
// Spracheinstellung erneut kostenpflichtig übersetzt.
export function UebersetzterText({
  eintragId,
  feld,
  original,
  zielsprache,
  mitUmschalter = true,
}: {
  eintragId: string
  feld: Feld
  original: string
  zielsprache: string
  mitUmschalter?: boolean
}) {
  const [uebersetzung, setUebersetzung] = useState<string | null>(null)
  const [zeigeOriginal, setZeigeOriginal] = useState(false)
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>(zielsprache === 'DE' ? 'bereit' : 'laedt')

  useEffect(() => {
    if (zielsprache === 'DE' || !original) { setUebersetzung(null); setLadeStatus('bereit'); return }
    let abgebrochen = false
    setLadeStatus('laedt')
    ;(async () => {
      const { data: vorhanden } = await supabase
        .from('bautagebuch_uebersetzungen')
        .select(feld)
        .eq('eintrag_id', eintragId)
        .eq('sprache', zielsprache)
        .maybeSingle()
      if (abgebrochen) return
      const vorhandeneUebersetzung = (vorhanden as Record<Feld, string | null> | null)?.[feld]
      if (vorhandeneUebersetzung) {
        setUebersetzung(vorhandeneUebersetzung)
        setLadeStatus('bereit')
        return
      }

      const { data, error } = await supabase.functions.invoke('uebersetzen', { body: { text: original, zielsprache } })
      if (abgebrochen) return
      if (error || !data?.text) { setLadeStatus('fehler'); return }
      setUebersetzung(data.text)
      setLadeStatus('bereit')
      await supabase
        .from('bautagebuch_uebersetzungen')
        .upsert({ eintrag_id: eintragId, sprache: zielsprache, [feld]: data.text }, { onConflict: 'eintrag_id,sprache' })
    })()
    return () => { abgebrochen = true }
  }, [eintragId, feld, original, zielsprache])

  if (zielsprache === 'DE' || ladeStatus === 'fehler' || !original) return <>{original}</>
  if (ladeStatus === 'laedt') return <span style={{ opacity: 0.6 }}>{original}</span>

  const anzeigeText = zeigeOriginal ? original : uebersetzung ?? original
  return (
    <>
      {anzeigeText}
      {mitUmschalter && uebersetzung && (
        <button
          type="button"
          onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setZeigeOriginal((v) => !v) }}
          style={{ all: 'unset', cursor: 'pointer', fontSize: 10.5, color: 'var(--ink-faint)', marginLeft: 8, textDecoration: 'underline' }}
        >
          {zeigeOriginal ? 'Übersetzung anzeigen' : 'Original anzeigen'}
        </button>
      )}
    </>
  )
}
