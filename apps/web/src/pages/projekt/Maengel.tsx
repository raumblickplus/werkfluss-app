import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil, pillStil } from '../stil'

type Mangel = {
  id: string
  titel: string
  beschreibung: string | null
  dringlichkeit: 'kritisch' | 'mittel' | 'gering'
  status: 'offen' | 'in_bearbeitung' | 'behoben' | 'abgenommen'
  zustaendiges_gewerk: string | null
  frist: string | null
}

type Gewerk = { id: string; name: string }

const dringlichkeitFarbe: Record<Mangel['dringlichkeit'], string> = {
  kritisch: 'var(--red)',
  mittel: 'var(--orange-text)',
  gering: 'var(--ink-faint)',
}

const statusLabel: Record<Mangel['status'], string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  behoben: 'Behoben',
  abgenommen: 'Abgenommen',
}

export default function Maengel({ projektId }: { projektId: string }) {
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [dringlichkeit, setDringlichkeit] = useState<Mangel['dringlichkeit']>('mittel')
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [gewerkId, setGewerkId] = useState('')
  const [frist, setFrist] = useState('')

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('maengel')
      .select('id, titel, beschreibung, dringlichkeit, status, zustaendiges_gewerk, frist')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: false })

    if (error) { setLadeStatus('fehler'); return }
    setMaengel(data ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  useEffect(() => {
    supabase.from('gewerke').select('id, name').order('sortierung').then(({ data }) => setGewerke(data ?? []))
  }, [])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    const gewerkName = gewerke.find((g) => g.id === gewerkId)?.name ?? null
    const { error } = await supabase.from('maengel').insert({
      projekt_id: projektId,
      titel,
      beschreibung: beschreibung || null,
      dringlichkeit,
      zustaendiges_gewerk: gewerkName,
      frist: frist || null,
      gemeldet_von: user?.id,
    })
    if (!error) {
      setTitel(''); setBeschreibung(''); setDringlichkeit('mittel'); setGewerkId(''); setFrist('')
      setZeigeFormular(false)
      laden()
    }
  }

  async function statusAendern(id: string, status: Mangel['status']) {
    await supabase.from('maengel').update({ status }).eq('id', id)
    laden()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Mangel melden'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Titel
            <input style={eingabeStil} value={titel} onChange={(e) => setTitel(e.target.value)} required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Beschreibung (optional)
            <textarea
              style={{ ...eingabeStil, minHeight: 60, fontFamily: 'inherit' }}
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Dringlichkeit
              <select
                style={eingabeStil}
                value={dringlichkeit}
                onChange={(e) => setDringlichkeit(e.target.value as Mangel['dringlichkeit'])}
              >
                <option value="kritisch">Kritisch</option>
                <option value="mittel">Mittel</option>
                <option value="gering">Gering</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 180px' }}>
              Zuständiges Gewerk (optional)
              <select style={eingabeStil} value={gewerkId} onChange={(e) => setGewerkId(e.target.value)}>
                <option value="">– kein Gewerk –</option>
                {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Frist (optional)
              <input type="date" style={eingabeStil} value={frist} onChange={(e) => setFrist(e.target.value)} />
            </label>
          </div>
          <button type="submit" style={knopfStil}>Mangel speichern</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Mängel …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Mängel konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && maengel.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Keine Mängel gemeldet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {maengel.map((m) => (
          <div key={m.id} style={{ ...karteStil, padding: '14px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{m.titel}</div>
                {m.beschreibung && <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 4 }}>{m.beschreibung}</div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {m.zustaendiges_gewerk && <span style={pillStil('neutral')}>{m.zustaendiges_gewerk}</span>}
                  {m.frist && (
                    <span style={pillStil(m.status !== 'behoben' && m.status !== 'abgenommen' && m.frist < new Date().toISOString().slice(0, 10) ? 'bad' : 'neutral')}>
                      Frist {new Date(m.frist).toLocaleDateString('de-DE')}
                    </span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: dringlichkeitFarbe[m.dringlichkeit], whiteSpace: 'nowrap' }}>
                {m.dringlichkeit.toUpperCase()}
              </span>
            </div>
            <select
              value={m.status}
              onChange={(e) => statusAendern(m.id, e.target.value as Mangel['status'])}
              style={{ ...eingabeStil, marginTop: 10, fontSize: 12, padding: '4px 8px' }}
            >
              {Object.entries(statusLabel).map(([wert, label]) => (
                <option key={wert} value={wert}>{label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
