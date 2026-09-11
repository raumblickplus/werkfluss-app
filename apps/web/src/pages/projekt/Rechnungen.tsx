import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil } from '../stil'
import { dokumentDrucken, rechnungDruckHtml, type DruckFirma } from '../../lib/druckExport'

type Firma = { id: string; name: string }
type AuftragOption = { id: string; angebot_id: string | null; firmen: Firma | null }

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

type Position = { id: string; kurztext: string; menge: number; einheit: string | null; einzelpreis_cents: number }

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
  const { aktivFirma } = useAuth()
  const [druckFirma, setDruckFirma] = useState<DruckFirma | null>(null)
  const [projektFuerDruck, setProjektFuerDruck] = useState<{ name: string; kunde_name: string | null; kunde_rechnungsadresse: string | null } | null>(null)
  const [druckFehler, setDruckFehler] = useState<string | null>(null)
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

  // Leistungsstand je Position des ausgewählten Auftrags (Konzept 8.2):
  // Grundlage für einen nachvollziehbaren Abschlagsrechnungs-Vorschlag statt
  // einer frei eingetippten Zahl.
  const [positionen, setPositionen] = useState<Position[]>([])
  const [leistungsstandAktuell, setLeistungsstandAktuell] = useState<Record<string, number>>({})
  const [leistungsstandEingabe, setLeistungsstandEingabe] = useState<Record<string, string>>({})
  const [bereitsAbgerechnetCents, setBereitsAbgerechnetCents] = useState(0)
  const [leistungsstandLaedt, setLeistungsstandLaedt] = useState(false)
  const [speichertLeistungsstand, setSpeichertLeistungsstand] = useState(false)
  const [zeigeLeistungsstand, setZeigeLeistungsstand] = useState(false)

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: rechnungenData, error: rechnungenFehler }, { data: auftraegeData }] = await Promise.all([
      supabase
        .from('rechnungen_ausgang')
        .select('id, auftrag_id, rechnungsnummer, typ, summe_netto_cents, mwst_satz, status, faellig_am, erstellt_am, auftraege(id, firmen(id, name))')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false }),
      supabase.from('auftraege').select('id, angebot_id, firmen(id, name)').eq('projekt_id', projektId),
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

  // Für den PDF-Druck: Aussteller-Firma (eigene, aktive Firma - der
  // Rechnungen-Tab ist ohnehin nur für den Projekteigentümer sichtbar) und
  // Empfänger-Angaben aus dem Projekt, einmalig geladen statt pro Klick.
  useEffect(() => {
    if (aktivFirma) {
      supabase
        .from('firmen')
        .select('name, rechtsform, adresse, ust_id, telefon, email, iban')
        .eq('id', aktivFirma.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (data) setDruckFirma(data as DruckFirma)
          // Bugfix (12.09.2026, Julian-Meldung "PDF-Export funktioniert
          // nicht"): häufigste Ursache ist, dass Migration 0051 (Telefon/
          // E-Mail/IBAN für Firmen) auf der Datenbank noch fehlt - dann
          // schlägt genau diese Abfrage fehl und der PDF-Button blieb
          // bisher stillschweigend deaktiviert, ohne erkennbaren Grund.
          if (error) setDruckFehler(`Firmendaten für den PDF-Kopf konnten nicht geladen werden (${error.message}). Wurde Migration 0051 bereits mit "supabase db push" eingespielt?`)
        })
    }
    supabase
      .from('projekte')
      .select('name, kunde_name, kunde_rechnungsadresse')
      .eq('id', projektId)
      .maybeSingle()
      .then(({ data }) => { if (data) setProjektFuerDruck(data) })
  }, [aktivFirma?.id, projektId])

  function rechnungDrucken(r: Rechnung) {
    if (!druckFirma || !projektFuerDruck) return
    const html = rechnungDruckHtml({
      rechnungsnummer: r.rechnungsnummer,
      typLabel: typLabel[r.typ],
      erstelltAm: r.erstellt_am,
      faelligAm: r.faellig_am,
      summeNettoCents: r.summe_netto_cents,
      mwstSatz: r.mwst_satz,
      firma: druckFirma,
      projektName: projektFuerDruck.name,
      kundeName: projektFuerDruck.kunde_name,
      kundeRechnungsadresse: projektFuerDruck.kunde_rechnungsadresse,
      auftragBezeichnung: r.auftraege?.firmen ? `Auftrag ${r.auftraege.firmen.name}` : null,
    })
    dokumentDrucken(`${r.rechnungsnummer} – ${projektFuerDruck.name}`, html)
  }

  async function auftragAusgewaehlt(neueAuftragId: string) {
    setAuftragId(neueAuftragId)
    setZeigeLeistungsstand(false)
    setPositionen([])
    setLeistungsstandAktuell({})
    setLeistungsstandEingabe({})
    setBereitsAbgerechnetCents(0)
    if (!neueAuftragId) return

    const auftrag = auftraege.find((a) => a.id === neueAuftragId)
    if (!auftrag?.angebot_id) return

    setLeistungsstandLaedt(true)
    const [{ data: posData }, { data: reData }] = await Promise.all([
      supabase.from('angebot_positionen').select('id, kurztext, menge, einheit, einzelpreis_cents').eq('angebot_id', auftrag.angebot_id).order('erstellt_am', { ascending: true }),
      supabase.from('rechnungen_ausgang').select('summe_netto_cents').eq('auftrag_id', neueAuftragId).eq('typ', 'abschlag').neq('status', 'storniert'),
    ])
    const posListe = (posData ?? []) as Position[]
    setPositionen(posListe)
    setBereitsAbgerechnetCents((reData ?? []).reduce((sum, r) => sum + r.summe_netto_cents, 0))

    if (posListe.length > 0) {
      const { data: lsData } = await supabase
        .from('leistungsstand_eintraege')
        .select('angebot_position_id, erbrachte_menge, erstellt_am')
        .in('angebot_position_id', posListe.map((p) => p.id))
        .order('erstellt_am', { ascending: true })
      const aktuell: Record<string, number> = {}
      for (const eintrag of lsData ?? []) aktuell[eintrag.angebot_position_id] = eintrag.erbrachte_menge
      setLeistungsstandAktuell(aktuell)
      const eingabe: Record<string, string> = {}
      for (const p of posListe) eingabe[p.id] = String(aktuell[p.id] ?? 0)
      setLeistungsstandEingabe(eingabe)
    }
    setLeistungsstandLaedt(false)
  }

  async function leistungsstandSpeichern() {
    setSpeichertLeistungsstand(true)
    const zeilen = positionen
      .map((p) => ({ p, menge: parseFloat((leistungsstandEingabe[p.id] ?? '').replace(',', '.')) }))
      .filter(({ menge, p }) => Number.isFinite(menge) && menge !== (leistungsstandAktuell[p.id] ?? 0))
      .map(({ p, menge }) => ({ projekt_id: projektId, angebot_position_id: p.id, erbrachte_menge: menge }))

    if (zeilen.length > 0) {
      await supabase.from('leistungsstand_eintraege').insert(zeilen)
      const neu = { ...leistungsstandAktuell }
      for (const z of zeilen) neu[z.angebot_position_id] = z.erbrachte_menge
      setLeistungsstandAktuell(neu)
    }
    setSpeichertLeistungsstand(false)
  }

  const kumulierterWertCents = positionen.reduce((sum, p) => {
    const menge = parseFloat((leistungsstandEingabe[p.id] ?? '').replace(',', '.'))
    return sum + Math.round((Number.isFinite(menge) ? menge : 0) * p.einzelpreis_cents)
  }, 0)
  const vorschlagCents = Math.max(0, kumulierterWertCents - bereitsAbgerechnetCents)

  function vorschlagUebernehmen() {
    setSummeEuro((vorschlagCents / 100).toFixed(2).replace('.', ','))
    setTyp('abschlag')
  }

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
      setRechnungsnummer(''); setSummeEuro(''); setFaelligAm('')
      auftragAusgewaehlt('')
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
      {druckFehler && (
        <div style={{ ...karteStil, marginBottom: 16, padding: '12px 16px', borderColor: 'var(--red)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{druckFehler}</p>
        </div>
      )}
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
              <select style={eingabeStil} value={auftragId} onChange={(e) => auftragAusgewaehlt(e.target.value)}>
                <option value="">– keiner –</option>
                {auftraege.map((a) => <option key={a.id} value={a.id}>{a.firmen?.name ?? 'Unbekannte Firma'}</option>)}
              </select>
            </label>
          )}

          {auftragId && (
            <div style={{ borderRadius: 12, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,.35)', padding: 12 }}>
              {leistungsstandLaedt ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>Lädt Leistungsverzeichnis …</p>
              ) : positionen.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>
                  Für diesen Auftrag liegen keine Positionen aus einem Angebot vor – kein Leistungsstand berechenbar.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setZeigeLeistungsstand((v) => !v)}
                    style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--olive)', marginBottom: zeigeLeistungsstand ? 10 : 0, display: 'block' }}
                  >
                    {zeigeLeistungsstand ? '▲ Leistungsstand ausblenden' : `▼ Leistungsstand erfassen (${positionen.length} Positionen)`}
                  </button>

                  {zeigeLeistungsstand && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {positionen.map((p) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
                          <span style={{ flex: 1, minWidth: 160 }}>{p.kurztext}</span>
                          <input
                            style={{ ...eingabeStil, width: 90, padding: '6px 8px' }}
                            value={leistungsstandEingabe[p.id] ?? '0'}
                            onChange={(e) => setLeistungsstandEingabe((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          />
                          <span style={{ color: 'var(--ink-faint)', minWidth: 90 }}>von {p.menge} {p.einheit ?? ''}</span>
                          <span style={{ color: 'var(--ink-faint)', minWidth: 90, textAlign: 'right' }}>
                            à {centsZuEuroText(p.einzelpreis_cents)}
                          </span>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={leistungsstandSpeichern}
                        disabled={speichertLeistungsstand}
                        style={{ ...knopfSekundaerStil, alignSelf: 'flex-start', fontSize: 11.5, padding: '6px 12px' }}
                      >
                        {speichertLeistungsstand ? 'Speichert …' : 'Leistungsstand speichern'}
                      </button>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--glass-border)', fontSize: 12.5 }}>
                        <span>Kumulierter Leistungswert: <b>{centsZuEuroText(kumulierterWertCents)}</b></span>
                        <span>Bereits abgerechnet: <b>{centsZuEuroText(bereitsAbgerechnetCents)}</b></span>
                        <span>Vorschlag für diese Abschlagsrechnung: <b style={{ color: 'var(--olive-light)' }}>{centsZuEuroText(vorschlagCents)}</b></span>
                      </div>
                      <button type="button" onClick={vorschlagUebernehmen} style={{ ...knopfSekundaerStil, alignSelf: 'flex-start', fontSize: 11.5, padding: '6px 12px' }}>
                        Vorschlag in Summe übernehmen
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => rechnungDrucken(r)}
                    disabled={!druckFirma || !projektFuerDruck}
                    style={{ ...knopfSekundaerStil, fontSize: 12, padding: '6px 12px' }}
                    title="Als PDF drucken/speichern"
                  >
                    PDF
                  </button>
                  <select
                    style={{ ...eingabeStil, fontSize: 13, padding: '6px 10px', color: statusFarbe[r.status] }}
                    value={r.status}
                    onChange={(e) => statusAendern(r.id, e.target.value as Rechnung['status'])}
                  >
                    {Object.entries(statusLabel).map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="footnote">
        Der Leistungsstand-Vorschlag basiert auf der von der ausführenden Firma (oder dem Eigentümer) je
        LV-Position gemeldeten erbrachten Menge – multipliziert mit dem Einzelpreis aus dem Angebot, abzüglich
        bereits gestellter Abschlagsrechnungen. Eine gesonderte Prüfung/Freigabe des gemeldeten Aufmaßes durch
        den Auftraggeber vor Rechnungsstellung ist bewusst nicht Teil dieser Umsetzung – die Summe bleibt vor
        dem Speichern frei editierbar.
      </p>
    </div>
  )
}
