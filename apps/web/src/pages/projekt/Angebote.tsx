import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, karteStil } from '../stil'

type Firma = { id: string; name: string }
type Gewerk = { id: string; name: string }

type Angebot = {
  id: string
  gewerk: string | null
  summe_netto_cents: number
  mwst_satz: number
  status: 'entwurf' | 'versendet' | 'angenommen' | 'abgelehnt'
  gueltig_bis: string | null
  erstellt_am: string
  firmen: Firma | null
}

type Auftrag = {
  id: string
  angebot_id: string | null
  summe_netto_cents: number
  status: 'aktiv' | 'abgeschlossen' | 'storniert'
  erstellt_am: string
  firmen: Firma | null
}

const statusLabel: Record<Angebot['status'], string> = {
  entwurf: 'Entwurf',
  versendet: 'Versendet',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
}

const auftragStatusLabel: Record<Auftrag['status'], string> = {
  aktiv: 'Aktiv',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function centsZuEuroText(cents: number) {
  return euro.format(cents / 100)
}

export default function Angebote({ projektId }: { projektId: string }) {
  const { aktivFirma } = useAuth()
  const [angebote, setAngebote] = useState<Angebot[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [firmenOptionen, setFirmenOptionen] = useState<Firma[]>([])
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [firmaId, setFirmaId] = useState('')
  const [gewerk, setGewerk] = useState('')
  const [summeEuro, setSummeEuro] = useState('')
  const [mwstSatz, setMwstSatz] = useState('19')
  const [gueltigBis, setGueltigBis] = useState('')

  async function laden() {
    setLadeStatus('laedt')
    const [
      { data: angeboteData, error: angeboteFehler },
      { data: auftraegeData },
      { data: mitgliederData },
      { data: gewerkeData },
    ] = await Promise.all([
      supabase
        .from('angebote')
        .select('id, gewerk, summe_netto_cents, mwst_satz, status, gueltig_bis, erstellt_am, firmen(id, name)')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false }),
      supabase
        .from('auftraege')
        .select('id, angebot_id, summe_netto_cents, status, erstellt_am, firmen(id, name)')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false }),
      supabase.from('projekt_mitglieder').select('firmen(id, name)').eq('projekt_id', projektId),
      supabase.from('gewerke').select('id, name').order('sortierung'),
    ])

    if (angeboteFehler) { setLadeStatus('fehler'); return }
    setAngebote((angeboteData ?? []) as unknown as Angebot[])
    setAuftraege((auftraegeData ?? []) as unknown as Auftrag[])
    setGewerke(gewerkeData ?? [])

    const verknuepfteFirmen = ((mitgliederData ?? []) as unknown as { firmen: Firma | null }[])
      .map((m) => m.firmen)
      .filter((f): f is Firma => Boolean(f))
    const alleFirmen = aktivFirma ? [aktivFirma, ...verknuepfteFirmen] : verknuepfteFirmen
    const eindeutig = Array.from(new Map(alleFirmen.map((f) => [f.id, f])).values())
    setFirmenOptionen(eindeutig)
    if (!firmaId && eindeutig.length > 0) setFirmaId(eindeutig[0].id)

    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId, aktivFirma?.id])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (!firmaId) return
    const summeCents = Math.round(parseFloat(summeEuro.replace(',', '.')) * 100)
    if (Number.isNaN(summeCents)) return

    const { error } = await supabase.from('angebote').insert({
      projekt_id: projektId,
      anbietende_firma_id: firmaId,
      gewerk: gewerk || null,
      summe_netto_cents: summeCents,
      mwst_satz: parseFloat(mwstSatz),
      gueltig_bis: gueltigBis || null,
    })
    if (!error) {
      setGewerk(''); setSummeEuro(''); setGueltigBis('')
      setZeigeFormular(false)
      laden()
    }
  }

  async function statusAendern(id: string, status: Angebot['status']) {
    await supabase.from('angebote').update({ status }).eq('id', id)
    laden()
  }

  async function auftragErstellen(angebot: Angebot) {
    if (!angebot.firmen) return
    await supabase.from('auftraege').insert({
      projekt_id: projektId,
      angebot_id: angebot.id,
      auftragnehmer_firma_id: angebot.firmen.id,
      summe_netto_cents: angebot.summe_netto_cents,
    })
    laden()
  }

  async function auftragStatusAendern(id: string, status: Auftrag['status']) {
    await supabase.from('auftraege').update({ status }).eq('id', id)
    laden()
  }

  const angebotHatAuftrag = (angebotId: string) => auftraege.some((a) => a.angebot_id === angebotId)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Angebot'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Anbietende Firma
            <select style={eingabeStil} value={firmaId} onChange={(e) => setFirmaId(e.target.value)} required>
              {firmenOptionen.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Gewerk (optional)
            <select style={eingabeStil} value={gewerk} onChange={(e) => setGewerk(e.target.value)}>
              <option value="">– keins –</option>
              {gewerke.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
            </select>
          </label>
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
            Gültig bis (optional)
            <input type="date" style={eingabeStil} value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} />
          </label>
          <button type="submit" style={knopfStil}>Angebot speichern</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Angebote …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Angebote konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && angebote.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Angebote.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {angebote.map((a) => {
          const bruttoCents = Math.round(a.summe_netto_cents * (1 + a.mwst_satz / 100))
          return (
            <div key={a.id} style={{ ...karteStil, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{a.firmen?.name ?? 'Unbekannte Firma'}{a.gewerk ? ` · ${a.gewerk}` : ''}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 2 }}>
                    {centsZuEuroText(a.summe_netto_cents)} netto ({euro.format(bruttoCents / 100)} brutto, {a.mwst_satz} % MwSt.)
                  </div>
                  {a.gueltig_bis && (
                    <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>
                      Gültig bis {new Date(a.gueltig_bis).toLocaleDateString('de-DE')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <select
                    style={{ ...eingabeStil, fontSize: 13, padding: '6px 10px' }}
                    value={a.status}
                    onChange={(e) => statusAendern(a.id, e.target.value as Angebot['status'])}
                  >
                    {Object.entries(statusLabel).map(([wert, label]) => (
                      <option key={wert} value={wert}>{label}</option>
                    ))}
                  </select>
                  {a.status === 'angenommen' && !angebotHatAuftrag(a.id) && (
                    <button style={{ ...knopfStil, fontSize: 12, padding: '6px 10px' }} onClick={() => auftragErstellen(a)}>
                      Auftrag erstellen
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {auftraege.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 10 }}>Aufträge</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {auftraege.map((au) => (
              <div key={au.id} style={{ ...karteStil, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{au.firmen?.name ?? 'Unbekannte Firma'}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 2 }}>{centsZuEuroText(au.summe_netto_cents)} netto</div>
                </div>
                <select
                  style={{ ...eingabeStil, fontSize: 13, padding: '6px 10px' }}
                  value={au.status}
                  onChange={(e) => auftragStatusAendern(au.id, e.target.value as Auftrag['status'])}
                >
                  {Object.entries(auftragStatusLabel).map(([wert, label]) => (
                    <option key={wert} value={wert}>{label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
