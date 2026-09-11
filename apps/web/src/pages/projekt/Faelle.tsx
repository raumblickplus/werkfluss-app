import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil, pillStil } from '../stil'

type FirmaMini = { id: string; name: string }
type AuftragMini = { id: string; summe_netto_cents: number; firmen: FirmaMini | null; angebote: { gewerk: string | null } | null }
type FallEreignis = {
  id: string
  fall_id: string
  typ: string
  beschreibung: string | null
  frist_bis: string | null
  erstellt_am: string
}
type Fall = {
  id: string
  projekt_id: string
  auftrag_id: string | null
  titel: string
  beschreibung: string | null
  gewerk: string | null
  status: string
  erstellt_am: string
}

// Eskalationsreihenfolge nach Konzept 8.18: Terminverzug festgestellt →
// Frist gesetzt → Mahnung dokumentiert → Streitschlichtung → Kündigung.
// "Beigelegt" ist von jeder Stufe aus erreichbar, deshalb nicht Teil dieser
// linearen Reihenfolge.
const ESKALATIONSSTUFEN = ['offen', 'frist_gesetzt', 'mahnung_dokumentiert', 'streitschlichtung', 'vertrag_gekuendigt'] as const

const statusLabel: Record<string, string> = {
  offen: 'Offen',
  frist_gesetzt: 'Frist gesetzt',
  mahnung_dokumentiert: 'Mahnung dokumentiert',
  streitschlichtung: 'Streitschlichtung angefragt',
  vertrag_gekuendigt: 'Vertrag gekündigt',
  beigelegt: 'Beigelegt',
}
const statusVariante: Record<string, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  offen: 'neutral',
  frist_gesetzt: 'warn',
  mahnung_dokumentiert: 'warn',
  streitschlichtung: 'bad',
  vertrag_gekuendigt: 'bad',
  beigelegt: 'ok',
}
const ereignisTypLabel: Record<string, string> = {
  eroeffnet: 'Fall eröffnet',
  frist_gesetzt: 'Frist gesetzt',
  mahnung_dokumentiert: 'Mahnung dokumentiert',
  streitschlichtung_angefragt: 'Streitschlichtung angefragt',
  vertrag_gekuendigt: 'Vertrag gekündigt',
  beigelegt: 'Beigelegt',
  notiz: 'Notiz',
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatZeitpunkt(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Faelle({ projektId, istEigentuemer }: { projektId: string; istEigentuemer: boolean }) {
  const [faelle, setFaelle] = useState<Fall[]>([])
  const [ereignisse, setEreignisse] = useState<FallEreignis[]>([])
  const [auftraege, setAuftraege] = useState<AuftragMini[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [neuerTitel, setNeuerTitel] = useState('')
  const [neueBeschreibung, setNeueBeschreibung] = useState('')
  const [neuesGewerk, setNeuesGewerk] = useState('')
  const [neuerAuftragId, setNeuerAuftragId] = useState('')
  const [eroeffnetLaeuft, setEroeffnetLaeuft] = useState(false)

  const [eskalationOffenFuer, setEskalationOffenFuer] = useState<string | null>(null)
  const [eskalationBeschreibung, setEskalationBeschreibung] = useState('')
  const [eskalationFrist, setEskalationFrist] = useState('')
  const [eskalationLaeuft, setEskalationLaeuft] = useState(false)

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: fData }, { data: eData }, { data: aData }] = await Promise.all([
      supabase.from('faelle').select('id, projekt_id, auftrag_id, titel, beschreibung, gewerk, status, erstellt_am').eq('projekt_id', projektId).order('erstellt_am', { ascending: false }),
      supabase
        .from('fall_ereignisse')
        .select('id, fall_id, typ, beschreibung, frist_bis, erstellt_am, faelle!inner(projekt_id)')
        .eq('faelle.projekt_id', projektId)
        .order('erstellt_am', { ascending: true }),
      supabase.from('auftraege').select('id, summe_netto_cents, firmen!auftragnehmer_firma_id(id, name), angebote(gewerk)').eq('projekt_id', projektId).eq('status', 'aktiv'),
    ])
    setFaelle((fData ?? []) as Fall[])
    setEreignisse((eData ?? []) as unknown as FallEreignis[])
    setAuftraege((aData ?? []) as unknown as AuftragMini[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  function auftragLabel(a: AuftragMini) {
    const gewerk = a.angebote?.gewerk
    return `${a.firmen?.name ?? 'Unbekannte Firma'}${gewerk ? ` · ${gewerk}` : ''}`
  }

  async function fallEroeffnen(e: FormEvent) {
    e.preventDefault()
    if (!neuerTitel.trim()) return
    setEroeffnetLaeuft(true)
    const { data, error } = await supabase
      .from('faelle')
      .insert({
        projekt_id: projektId,
        auftrag_id: neuerAuftragId || null,
        titel: neuerTitel.trim(),
        beschreibung: neueBeschreibung.trim() || null,
        gewerk: neuesGewerk.trim() || null,
      })
      .select('id')
      .single()
    if (!error && data) {
      await supabase.from('fall_ereignisse').insert({
        fall_id: data.id,
        typ: 'eroeffnet',
        beschreibung: neueBeschreibung.trim() || null,
      })
      setNeuerTitel(''); setNeueBeschreibung(''); setNeuesGewerk(''); setNeuerAuftragId('')
      setZeigeFormular(false)
      await laden()
    }
    setEroeffnetLaeuft(false)
  }

  async function stufeDokumentieren(fall: Fall, neueStufe: string) {
    if (!eskalationBeschreibung.trim() && neueStufe !== 'beigelegt') return
    setEskalationLaeuft(true)
    await supabase.from('faelle').update({ status: neueStufe }).eq('id', fall.id)
    await supabase.from('fall_ereignisse').insert({
      fall_id: fall.id,
      typ: neueStufe === 'frist_gesetzt' ? 'frist_gesetzt'
        : neueStufe === 'mahnung_dokumentiert' ? 'mahnung_dokumentiert'
        : neueStufe === 'streitschlichtung' ? 'streitschlichtung_angefragt'
        : neueStufe === 'vertrag_gekuendigt' ? 'vertrag_gekuendigt'
        : 'beigelegt',
      beschreibung: eskalationBeschreibung.trim() || null,
      frist_bis: neueStufe === 'frist_gesetzt' && eskalationFrist ? eskalationFrist : null,
    })
    setEskalationBeschreibung(''); setEskalationFrist(''); setEskalationOffenFuer(null)
    setEskalationLaeuft(false)
    await laden()
  }

  if (ladeStatus === 'laedt') return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>

  return (
    <div>
      {istEigentuemer && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
            {zeigeFormular ? 'Abbrechen' : '+ Fall eröffnen'}
          </button>
        </div>
      )}

      {zeigeFormular && (
        <form onSubmit={fallEroeffnen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Titel
            <input style={eingabeStil} value={neuerTitel} onChange={(e) => setNeuerTitel(e.target.value)} placeholder="z. B. Trockenbau seit 3 Wochen nicht begonnen" required />
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 220px' }}>
              Betroffener Auftrag (optional)
              <select style={eingabeStil} value={neuerAuftragId} onChange={(e) => setNeuerAuftragId(e.target.value)}>
                <option value="">– kein bestimmter Auftrag –</option>
                {auftraege.map((a) => <option key={a.id} value={a.id}>{auftragLabel(a)}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Gewerk (optional)
              <input style={eingabeStil} value={neuesGewerk} onChange={(e) => setNeuesGewerk(e.target.value)} placeholder="z. B. Trockenbau" />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Sachverhalt
            <textarea style={{ ...eingabeStil, minHeight: 80, resize: 'vertical' }} value={neueBeschreibung} onChange={(e) => setNeueBeschreibung(e.target.value)} placeholder="Was genau ist passiert, seit wann?" />
          </label>
          <button type="submit" style={knopfStil} disabled={eroeffnetLaeuft || !neuerTitel.trim()}>
            {eroeffnetLaeuft ? 'Speichert …' : 'Fall eröffnen'}
          </button>
        </form>
      )}

      {faelle.length === 0 && <p style={{ color: 'var(--ink-faint)' }}>Noch keine Fälle – gut so.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {faelle.map((fall) => {
          const verlauf = ereignisse.filter((e) => e.fall_id === fall.id)
          const aktuellerIndex = ESKALATIONSSTUFEN.indexOf(fall.status as typeof ESKALATIONSSTUFEN[number])
          const naechsteStufe = aktuellerIndex >= 0 && aktuellerIndex < ESKALATIONSSTUFEN.length - 1 ? ESKALATIONSSTUFEN[aktuellerIndex + 1] : null
          const abgeschlossen = fall.status === 'beigelegt' || fall.status === 'vertrag_gekuendigt'
          const eskalationOffen = eskalationOffenFuer === fall.id

          return (
            <div key={fall.id} style={karteStil}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>{fall.titel}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                    Eröffnet {formatDatum(fall.erstellt_am)}{fall.gewerk ? ` · ${fall.gewerk}` : ''}
                  </div>
                </div>
                <span style={pillStil(statusVariante[fall.status] ?? 'neutral')}>{statusLabel[fall.status] ?? fall.status}</span>
              </div>

              {fall.beschreibung && <p style={{ fontSize: 12.5, color: 'var(--ink-dim)', margin: '10px 0 0' }}>{fall.beschreibung}</p>}

              {verlauf.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '2px solid var(--glass-border)', paddingLeft: 12 }}>
                  {verlauf.map((ev) => (
                    <div key={ev.id} style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>
                        {ereignisTypLabel[ev.typ] ?? ev.typ} <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}>· {formatZeitpunkt(ev.erstellt_am)}</span>
                      </div>
                      {ev.beschreibung && <div style={{ color: 'var(--ink-dim)' }}>{ev.beschreibung}</div>}
                      {ev.frist_bis && <div style={{ color: 'var(--orange-text)' }}>Frist bis {formatDatum(ev.frist_bis)}</div>}
                    </div>
                  ))}
                </div>
              )}

              {istEigentuemer && !abgeschlossen && (
                <div style={{ marginTop: 14 }}>
                  {!eskalationOffen ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {naechsteStufe && (
                        <button
                          type="button"
                          onClick={() => { setEskalationOffenFuer(fall.id); setEskalationBeschreibung(''); setEskalationFrist('') }}
                          style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'transparent' }}
                        >
                          → {statusLabel[naechsteStufe]} dokumentieren
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => stufeDokumentieren(fall, 'beigelegt')}
                        style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: 'none', background: 'var(--olive)', color: '#fff' }}
                      >
                        Als beigelegt markieren
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,.03)' }}>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>
                        Nächste Stufe: <strong>{naechsteStufe ? statusLabel[naechsteStufe] : '–'}</strong>
                      </p>
                      {naechsteStufe === 'frist_gesetzt' && (
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)' }}>
                          Frist bis
                          <input type="date" style={eingabeStil} value={eskalationFrist} onChange={(e) => setEskalationFrist(e.target.value)} />
                        </label>
                      )}
                      <textarea
                        style={{ ...eingabeStil, minHeight: 70, resize: 'vertical' }}
                        value={eskalationBeschreibung}
                        onChange={(e) => setEskalationBeschreibung(e.target.value)}
                        placeholder="Nachweis/Beschreibung, z. B. „Mahnung per E-Mail an … verschickt, Frist bis …“"
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={eskalationLaeuft || !eskalationBeschreibung.trim()}
                          onClick={() => naechsteStufe && stufeDokumentieren(fall, naechsteStufe)}
                          style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: 'none', background: 'var(--olive)', color: '#fff' }}
                        >
                          {eskalationLaeuft ? 'Speichert …' : 'Dokumentieren & Stufe setzen'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEskalationOffenFuer(null)}
                          style={{ fontSize: 11.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'transparent' }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="footnote">
        Fälle sind eine strukturierte, zeitgestempelte Akte für Eskalationen (Terminverzug, Leistungsstörung,
        Streit) – jede Stufe bleibt dauerhaft dokumentiert. Was hier bewusst fehlt: eine automatische
        Insolvenzindiz-Erkennung, ein in die Plattform eingebundener Mediator und eine automatisierte
        Vertragskündigung. Dokumentation und Entscheidung bleiben bei euch, Werkfluss führt nur die Akte.
      </p>
    </div>
  )
}
