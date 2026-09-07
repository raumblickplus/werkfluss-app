import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { adresseZuKoordinaten, aktuellesWetter, type Koordinaten } from '../../lib/wetter'
import { eingabeStil, knopfStil, karteStil } from '../stil'

type Eintrag = {
  id: string
  datum: string
  wetter: string | null
  temperatur_grad: number | null
  taetigkeiten: string
  besonderheiten: string | null
}

type Props = {
  projektId: string
  adresse: string | null
  koordinaten: Koordinaten | null
}

export default function Bautagebuch({ projektId, adresse, koordinaten }: Props) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [taetigkeiten, setTaetigkeiten] = useState('')
  const [wetter, setWetter] = useState('')
  const [temperatur, setTemperatur] = useState('')
  const [besonderheiten, setBesonderheiten] = useState('')
  const [wetterStatus, setWetterStatus] = useState<'inaktiv' | 'laedt' | 'gefunden' | 'nicht_gefunden'>('inaktiv')

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('bautagebuch_eintraege')
      .select('id, datum, wetter, temperatur_grad, taetigkeiten, besonderheiten')
      .eq('projekt_id', projektId)
      .order('datum', { ascending: false })
      .order('erstellt_am', { ascending: false })

    if (error) { setLadeStatus('fehler'); return }
    setEintraege(data ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function wetterLaden() {
    setWetterStatus('laedt')

    let punkt = koordinaten
    if (!punkt && adresse) {
      punkt = await adresseZuKoordinaten(adresse)
      // Gefundene Koordinaten am Projekt zwischenspeichern, damit der nächste
      // Eintrag nicht erneut geokodieren muss.
      if (punkt) {
        supabase
          .from('projekte')
          .update({ breitengrad: punkt.breitengrad, laengengrad: punkt.laengengrad })
          .eq('id', projektId)
          .then(() => {})
      }
    }

    if (!punkt) {
      setWetterStatus('nicht_gefunden')
      return
    }

    const wetterDaten = await aktuellesWetter(punkt)
    if (!wetterDaten) {
      setWetterStatus('nicht_gefunden')
      return
    }

    setWetter(wetterDaten.beschreibung)
    setTemperatur(String(Math.round(wetterDaten.temperatur)))
    setWetterStatus('gefunden')
  }

  function formularOeffnen() {
    setZeigeFormular(true)
    wetterLaden()
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('bautagebuch_eintraege').insert({
      projekt_id: projektId,
      autor_id: user?.id,
      taetigkeiten,
      wetter: wetter || null,
      temperatur_grad: temperatur ? Number(temperatur) : null,
      besonderheiten: besonderheiten || null,
    })
    if (!error) {
      setTaetigkeiten(''); setWetter(''); setTemperatur(''); setBesonderheiten('')
      setZeigeFormular(false)
      setWetterStatus('inaktiv')
      laden()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => (zeigeFormular ? setZeigeFormular(false) : formularOeffnen())}>
          {zeigeFormular ? 'Abbrechen' : '+ Eintrag'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Tätigkeiten heute
            <textarea
              style={{ ...eingabeStil, minHeight: 70, fontFamily: 'inherit' }}
              value={taetigkeiten}
              onChange={(e) => setTaetigkeiten(e.target.value)}
              required
            />
          </label>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: 2 }}>
              Wetter
              <input style={eingabeStil} value={wetter} onChange={(e) => setWetter(e.target.value)} placeholder="z.B. bewölkt" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', width: 90 }}>
              °C
              <input style={eingabeStil} value={temperatur} onChange={(e) => setTemperatur(e.target.value)} inputMode="numeric" />
            </label>
            <button
              type="button"
              onClick={wetterLaden}
              title="Wetter erneut automatisch abrufen"
              style={{ ...eingabeStil, cursor: 'pointer', padding: '10px 12px' }}
            >
              🔄
            </button>
          </div>
          {wetterStatus === 'laedt' && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Wetter wird automatisch geladen …</div>}
          {wetterStatus === 'gefunden' && <div style={{ fontSize: 12, color: 'var(--olive)' }}>Automatisch anhand des Projektstandorts geladen – bei Bedarf anpassen.</div>}
          {wetterStatus === 'nicht_gefunden' && (
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              Konnte den Standort nicht automatisch bestimmen (Adresse am Projekt prüfen) – bitte Wetter manuell eintragen.
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Besonderheiten (optional)
            <textarea
              style={{ ...eingabeStil, minHeight: 50, fontFamily: 'inherit' }}
              value={besonderheiten}
              onChange={(e) => setBesonderheiten(e.target.value)}
            />
          </label>
          <button type="submit" style={knopfStil}>Eintrag speichern</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Bautagebuch …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Bautagebuch konnte nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && eintraege.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Einträge.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {eintraege.map((e) => (
          <div key={e.id} style={{ ...karteStil, padding: '14px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                {new Date(e.datum).toLocaleDateString('de-DE')}
              </span>
              {e.wetter && (
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  {e.wetter}{e.temperatur_grad !== null ? `, ${e.temperatur_grad}°C` : ''}
                </span>
              )}
            </div>
            <div style={{ fontSize: 14 }}>{e.taetigkeiten}</div>
            {e.besonderheiten && (
              <div style={{ fontSize: 13, color: 'var(--orange-text)', marginTop: 6 }}>⚠ {e.besonderheiten}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
