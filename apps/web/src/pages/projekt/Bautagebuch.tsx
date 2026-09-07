import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil } from '../stil'

type Eintrag = {
  id: string
  datum: string
  wetter: string | null
  taetigkeiten: string
  besonderheiten: string | null
}

export default function Bautagebuch({ projektId }: { projektId: string }) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [taetigkeiten, setTaetigkeiten] = useState('')
  const [wetter, setWetter] = useState('')
  const [besonderheiten, setBesonderheiten] = useState('')

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('bautagebuch_eintraege')
      .select('id, datum, wetter, taetigkeiten, besonderheiten')
      .eq('projekt_id', projektId)
      .order('datum', { ascending: false })
      .order('erstellt_am', { ascending: false })

    if (error) { setLadeStatus('fehler'); return }
    setEintraege(data ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('bautagebuch_eintraege').insert({
      projekt_id: projektId,
      autor_id: user?.id,
      taetigkeiten,
      wetter: wetter || null,
      besonderheiten: besonderheiten || null,
    })
    if (!error) {
      setTaetigkeiten(''); setWetter(''); setBesonderheiten('')
      setZeigeFormular(false)
      laden()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
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
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Wetter (optional)
            <input style={eingabeStil} value={wetter} onChange={(e) => setWetter(e.target.value)} placeholder="z.B. bewölkt, 14°C" />
          </label>
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
              {e.wetter && <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{e.wetter}</span>}
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
