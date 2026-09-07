import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil } from '../stil'

type Firma = { id: string; name: string }
type AuftragOption = { id: string; firmen: Firma | null }

type Rechnung = {
  id: string
  auftrag_id: string | null
  rechnungsnummer: string
  typ: 'abschlag' | 'schluss' | 'sonstige'
  summe_netto_cents: number
  mwst_satz: number
  status: 'offen' | 'bezahlt' | 'ueberfaellig' | 'storniert'
  faellig_am: string | null
  erstellt_am: string
  auftraege: AuftragOption | null
}

const typLabel: Record<Rechnung['typ'], string> = {
  abschlag: 'Abschlagsrechnung',
  schluss: 'Schlussrechnung',
  sonstige: 'Sonstige',
}

const statusLabel: Record<Rechnung['status'], string> = {
  offen: 'Offen',
  bezahlt: 'Bezahlt',
  ueberfaellig: 'Überfällig',
  storniert: 'Storniert',
}

const statusFarbe: Record<Rechnung['status'], string> = {
  offen: 'var(--ink-dim)',
  bezahlt: 'var(--olive)',
  ueberfaellig: 'var(--red)',
  storniert: 'var(--ink-faint)',
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const centsZuEuroText = (cents: number) => euro.format(cents / 100)

export default function Rechnungen({ projektId }: { projektId: string }) {
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([])
  const [auftraege, setAuftraege] = useState<AuftragOption[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [rechnungsnummer, setRechnungsnummer] = useState('')
  const [typ, setTyp] = useState<Rechnung['typ']>('abschlag')
  const [auftragId, setAuftragId] = useState('')
  const [summeEuro, setSummeEuro] = useState('')
  const [mwstSatz, setMwstSatz] = useState('19')
  const [faelligAm, setFaelligAm] = useState('')

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: rechnungenData, error: rechnungenFehler }, { data: auftraegeData }] = await Promise.all([
      supabase
        .from('rechnungen_ausgang')
        .select('id, auftrag_id, rechnungsnummer, typ, summe_netto_cents, mwst_satz, status, faellig_am, erstellt_am, auftraege(id, firmen(id, name))')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false }),
      supabase.from('auftraege').select('id, firmen(id, name)').eq('projekt_id', projektId),
    ])
    if (rechnungenFehler) { setLadeStatus('fehler'); return }
    const liste = (rechnungenData ?? []) as unknown as Rechnung[]
    setRechnungen(liste)
    setAuftraege((auftraegeData ?? []) as unknown as AuftragOption[])

    if (!rechnungsnummer) {
      const jahr = new Date().getFullYear()
      setRechnungsnummer(`RE-${jahr}-${String(liste.length + 1).padStart(3, '0')}`)
    }
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const summeCents = Math.round(parseFloat(summeEuro.replace(',', '.')) * 100)
    if (Number.isNaN(summeCents) || !rechnungsnummer) return

    const { error } = await supabase.from('rechnungen_ausgang').insert({
      projekt_id: projektId,
      auftrag_id: auftragId || null,
      rechnungsnummer,
      typ,
      summe_netto_cents: summeCents,
      mwst_satz: parseFloat(mwstSatz),
      faellig_am: faelligAm || null,
    })
    if (!error) {
      setRechnungsnummer(''); setSummeEuro(''); setFaelligAm(''); setAuftragId('')
      setZeigeFormular(false)
      laden()
    }
  }

  async function statusAendern(id: string, status: Rechnung['status']) {
    await supabase.from('rechnungen_ausgang').update({ status }).eq('id', id)
    laden()
  }

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--ink-faint)' }}>
        Für den Anfang: Rechnungsnummer und Fälligkeit trägst du noch selbst ein/pflegst sie.
        Eine lückenlose, GoBD-taugliche Nummerierung mit echter Buchhaltungsanbindung (DATEV-Export etc.)
        ist ein späterer Ausbauschritt.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Rechnung'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: 1 }}>
              Rechnungsnummer
              <input style={eingabeStil} value={rechnungsnummer} onChange={(e) => setRechnungsnummer(e.target.value)} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', width: 170 }}>
              Typ
              <select style={eingabeStil} value={typ} onChange={(e) => setTyp(e.target.value as Rechnung['typ'])}>
                {Object.entries(typLabel).map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
              </select>
            </label>
          </div>
          {auftraege.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
              Zugehöriger Auftrag (optional)
              <select style={eingabeStil} value={auftragId} onChange={(e) => setAuftragId(e.target.value)}>
                <option value="">– keiner –</option>
                {auftraege.map((a) => <option key={a.id} value={a.id}>{a.firmen?.name ?? 'Unbekannte Firma'}</option>)}
              </select>
            </label>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: 1 }}>
              Summe netto (€)
              <input style={eingabeStil} value={summeEuro} onChange={(e) => setSummeEuro(e.target.value)} required placeholder="z.B. 4500" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', width: 110 }}>
              MwSt.
              <select style={eingabeStil} value={mwstSatz} onChange={(e) => setMwstSatz(e.target.value)}>
                <option value="19">19 %</option>
                <option value="7">7 %</option>
                <option value="0">0 %</option>
              </select>
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Fällig am (optional)
            <input type="date" style={eingabeStil} value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
          </label>
          <button type="submit" style={knopfStil}>Rechnung speichern</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Rechnungen …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Rechnungen konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && rechnungen.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Rechnungen.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rechnungen.map((r) => {
          const bruttoCents = Math.round(r.summe_netto_cents * (1 + r.mwst_satz / 100))
          const istUeberfaellig = r.status === 'offen' && r.faellig_am && new Date(r.faellig_am) < new Date()
          return (
            <div key={r.id} style={{ ...karteStil, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.rechnungsnummer} · {typLabel[r.typ]}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 2 }}>
                    {centsZuEuroText(r.summe_netto_cents)} netto ({euro.format(bruttoCents / 100)} brutto, {r.mwst_satz} % MwSt.)
                    {r.auftraege?.firmen ? ` · ${r.auftraege.firmen.name}` : ''}
                  </div>
                  {r.faellig_am && (
                    <div style={{ fontSize: 12, color: istUeberfaellig ? 'var(--red)' : 'var(--ink-faint)', marginTop: 2 }}>
                      Fällig am {new Date(r.faellig_am).toLocaleDateString('de-DE')}{istUeberfaellig ? ' – überfällig' : ''}
                    </div>
                  )}
                </div>
                <select
                  style={{ ...eingabeStil, fontSize: 13, padding: '6px 10px', color: statusFarbe[r.status] }}
                  value={r.status}
                  onChange={(e) => statusAendern(r.id, e.target.value as Rechnung['status'])}
                >
                  {Object.entries(statusLabel).map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
