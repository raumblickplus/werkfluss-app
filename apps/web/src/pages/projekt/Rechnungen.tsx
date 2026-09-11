import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil } from '../stil'
import { druckfensterOeffnen, dokumentInFensterSchreiben, rechnungDruckHtml, type DruckFirma, type DruckPosition, type Sprache } from '../../lib/druckExport'

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
  bestellreferenz: string | null
  erstellt_am: string
  auftraege: AuftragOption | null
}

// Positionen aus dem Angebot/LV des gewählten Auftrags - dienen dem
// Leistungsstand-Vorschlag (0045), rein lesend.
type LvPosition = { id: string; kurztext: string; menge: number; einheit: string | null; einzelpreis_cents: number }

// Frei editierbare Positionszeilen im neuen "Baukasten"-Editor (0054) -
// als Strings gehalten, damit während des Tippens (z.B. "12,5") nichts
// weggerundet wird; Umrechnung erst beim Speichern/in der Vorschau.
type RechnungPositionEntwurf = { id: string; kurztext: string; menge: string; einheit: string; einzelpreisEuro: string }

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
const euroZuCents = (text: string) => Math.round(parseFloat(text.replace(',', '.')) * 100)

function neuePositionsZeile(): RechnungPositionEntwurf {
  return { id: crypto.randomUUID(), kurztext: '', menge: '1', einheit: '', einzelpreisEuro: '' }
}

// Live-Vorschau im "Baukasten"-Stil (Julian-Referenz-Screenshot 11.09.2026):
// dieselbe Bildsprache wie der spätere PDF-Druck (druckExport.ts) - Logo,
// Akzentfarbe, Positionstabelle, Summenleiste - aber direkt als React-DOM,
// damit sie sich beim Tippen live mit aktualisiert, statt erst im
// Druckfenster sichtbar zu werden.
function RechnungVorschau({
  sprache, akzent, logoUrl, firmenname, kundeName, kundeAdresse, rechnungsnummer,
  typLabel: typLabelText, faelligAm, bestellreferenz, positionen, summeNettoCents, mwstSatz,
}: {
  sprache: Sprache
  akzent: string
  logoUrl: string | null
  firmenname: string
  kundeName: string
  kundeAdresse: string | null
  rechnungsnummer: string
  typLabel: string
  faelligAm: string
  bestellreferenz: string
  positionen: RechnungPositionEntwurf[]
  summeNettoCents: number
  mwstSatz: number
}) {
  const t = sprache === 'en'
    ? { titel: 'Invoice', an: 'Bill to', nr: 'No.', faellig: 'Due date', bestell: 'PO reference', leistung: 'Description', menge: 'Qty', preis: 'Unit price', gesamt: 'Total', netto: 'Net', ust: `plus ${mwstSatz}% VAT`, summe: 'Total amount' }
    : { titel: 'Rechnung', an: 'Rechnungsempfänger', nr: 'Nr.', faellig: 'Fällig am', bestell: 'Bestellreferenz', leistung: 'Leistung', menge: 'Menge', preis: 'Einzelpreis', gesamt: 'Gesamt', netto: 'Netto', ust: `zzgl. ${mwstSatz}% USt.`, summe: 'Gesamtbetrag' }
  const geld = new Intl.NumberFormat(sprache === 'en' ? 'en-IE' : 'de-DE', { style: 'currency', currency: 'EUR' }).format
  const mwstCents = Math.round(summeNettoCents * (mwstSatz / 100))
  const bruttoCents = summeNettoCents + mwstCents
  const habenPositionen = positionen.some((p) => p.kurztext.trim())

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--glass-border)', background: '#fff', boxShadow: '0 12px 32px -20px rgba(0,0,0,.35)' }}>
      <div style={{ height: 6, background: akzent }} />
      <div style={{ padding: '28px 30px', fontFamily: '-apple-system, "Helvetica Neue", Arial, sans-serif', fontSize: 12.5, color: '#1c1c1a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 26 }}>
          <div style={{ color: '#55554f' }}>
            {logoUrl && <img src={logoUrl} alt="" style={{ maxHeight: 38, maxWidth: 150, objectFit: 'contain', marginBottom: 8, display: 'block' }} />}
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1c1c1a' }}>{firmenname || 'Deine Firma'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', textTransform: 'uppercase', color: akzent }}>{t.titel}</div>
            <div style={{ color: '#55554f', marginTop: 6, fontSize: 11.5 }}>
              {t.nr} {rechnungsnummer || '–'}<br />
              {faelligAm ? `${t.faellig}: ${new Date(faelligAm).toLocaleDateString(sprache === 'en' ? 'en-GB' : 'de-DE')}` : null}
              {bestellreferenz ? <><br />{t.bestell}: {bestellreferenz}</> : null}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: '#8a897f', fontWeight: 700, marginBottom: 3 }}>{t.an}</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{kundeName || '+ Kunden hinzufügen'}</div>
          {kundeAdresse && <div style={{ color: '#55554f', whiteSpace: 'pre-line' }}>{kundeAdresse}</div>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '7px 6px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', color: '#55554f', borderBottom: `2px solid ${akzent}` }}>{t.leistung}</th>
              {habenPositionen && <th style={{ textAlign: 'right', padding: '7px 6px', fontSize: 9.5, textTransform: 'uppercase', color: '#55554f', borderBottom: `2px solid ${akzent}` }}>{t.menge}</th>}
              {habenPositionen && <th style={{ textAlign: 'right', padding: '7px 6px', fontSize: 9.5, textTransform: 'uppercase', color: '#55554f', borderBottom: `2px solid ${akzent}` }}>{t.preis}</th>}
              <th style={{ textAlign: 'right', padding: '7px 6px', fontSize: 9.5, textTransform: 'uppercase', color: '#55554f', borderBottom: `2px solid ${akzent}` }}>{habenPositionen ? t.gesamt : t.preis}</th>
            </tr>
          </thead>
          <tbody>
            {habenPositionen ? positionen.filter((p) => p.kurztext.trim()).map((p, i) => {
              const menge = parseFloat(p.menge.replace(',', '.')) || 0
              const preisCents = euroZuCents(p.einzelpreisEuro || '0') || 0
              return (
                <tr key={p.id} style={{ background: i % 2 === 1 ? '#f7f6f1' : undefined }}>
                  <td style={{ padding: '7px 6px' }}>{p.kurztext}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right' }}>{menge} {p.einheit}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right' }}>{geld(preisCents / 100)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right' }}>{geld((menge * preisCents) / 100)}</td>
                </tr>
              )
            }) : (
              <tr><td style={{ padding: '7px 6px', color: '#8a897f' }}>{typLabelText}</td><td style={{ padding: '7px 6px', textAlign: 'right' }}>{geld(summeNettoCents / 100)}</td></tr>
            )}
          </tbody>
        </table>

        <div style={{ marginLeft: 'auto', width: 220, marginTop: 10, color: '#55554f', fontSize: 11.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>{t.netto}</span><span>{geld(summeNettoCents / 100)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>{t.ust}</span><span>{geld(mwstCents / 100)}</span></div>
        </div>
        <div style={{ marginLeft: 'auto', marginTop: 10, width: 220, borderRadius: 12, padding: '13px 16px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: `linear-gradient(135deg, ${akzent}, color-mix(in srgb, ${akzent} 45%, #1c1c1a))` }}>
          <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', opacity: .85 }}>{t.summe}</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{geld(bruttoCents / 100)}</span>
        </div>
      </div>
    </div>
  )
}

export default function Rechnungen({ projektId }: { projektId: string }) {
  const { aktivFirma } = useAuth()
  const [druckFirma, setDruckFirma] = useState<DruckFirma | null>(null)
  const [projektFuerDruck, setProjektFuerDruck] = useState<{ name: string; kunde_name: string | null; kunde_rechnungsadresse: string | null } | null>(null)
  const [druckFehler, setDruckFehler] = useState<string | null>(null)
  const [druckSprache, setDruckSprache] = useState<Record<string, Sprache>>({})
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([])
  const [auftraege, setAuftraege] = useState<AuftragOption[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [editorTab, setEditorTab] = useState<'details' | 'stil'>('details')

  const [rechnungsnummer, setRechnungsnummer] = useState('')
  const [typ, setTyp] = useState<Rechnung['typ']>('abschlag')
  const [auftragId, setAuftragId] = useState('')
  const [summeEuro, setSummeEuro] = useState('')
  const [mwstSatz, setMwstSatz] = useState('19')
  const [faelligAm, setFaelligAm] = useState('')
  const [bestellreferenz, setBestellreferenz] = useState('')
  const [sprache, setSprache] = useState<Sprache>('de')
  const [rechnungPositionen, setRechnungPositionen] = useState<RechnungPositionEntwurf[]>([])

  // Leistungsstand je Position des ausgewählten Auftrags (Konzept 8.2):
  // Grundlage für einen nachvollziehbaren Abschlagsrechnungs-Vorschlag statt
  // einer frei eingetippten Zahl.
  const [lvPositionen, setLvPositionen] = useState<LvPosition[]>([])
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
        .select('id, auftrag_id, rechnungsnummer, typ, summe_netto_cents, mwst_satz, status, faellig_am, bestellreferenz, erstellt_am, auftraege(id, firmen!auftragnehmer_firma_id(id, name))')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false }),
      supabase.from('auftraege').select('id, angebot_id, firmen!auftragnehmer_firma_id(id, name)').eq('projekt_id', projektId),
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

  // Für den PDF-Druck und die Baukasten-Vorschau: Aussteller-Firma (eigene,
  // aktive Firma) und Empfänger-Angaben aus dem Projekt, einmalig geladen
  // statt pro Klick.
  useEffect(() => {
    if (aktivFirma) {
      supabase
        .from('firmen')
        .select('name, rechtsform, adresse, ust_id, telefon, email, iban, logo_url, akzentfarbe')
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

  // Positionen einer bereits gespeicherten Rechnung erst beim Drucken
  // nachladen (nicht in laden() vorab für alle Rechnungen, um die Liste
  // schlank zu halten) - das Druckfenster wird dafür wie in Angebote.tsx
  // IMMER zuerst synchron geöffnet, damit Safari/Chrome den Popup nicht
  // als "kein Nutzer-Klick" blockieren (Bugfix vom 12.09.2026).
  async function rechnungDrucken(r: Rechnung) {
    if (!druckFirma || !projektFuerDruck) return
    const fenster = druckfensterOeffnen()
    if (!fenster) return
    const { data: posData } = await supabase
      .from('rechnung_positionen')
      .select('kurztext, menge, einheit, einzelpreis_cents')
      .eq('rechnung_id', r.id)
      .order('reihenfolge', { ascending: true })
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
      bestellreferenz: r.bestellreferenz,
      positionen: (posData ?? []) as DruckPosition[],
      sprache: druckSprache[r.id] ?? 'de',
    })
    dokumentInFensterSchreiben(fenster, `${r.rechnungsnummer} – ${projektFuerDruck.name}`, html, druckFirma.akzentfarbe)
  }

  async function auftragAusgewaehlt(neueAuftragId: string) {
    setAuftragId(neueAuftragId)
    setZeigeLeistungsstand(false)
    setLvPositionen([])
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
    const posListe = (posData ?? []) as LvPosition[]
    setLvPositionen(posListe)
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
    const zeilen = lvPositionen
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

  const kumulierterWertCents = lvPositionen.reduce((sum, p) => {
    const menge = parseFloat((leistungsstandEingabe[p.id] ?? '').replace(',', '.'))
    return sum + Math.round((Number.isFinite(menge) ? menge : 0) * p.einzelpreis_cents)
  }, 0)
  const vorschlagCents = Math.max(0, kumulierterWertCents - bereitsAbgerechnetCents)

  function vorschlagUebernehmen() {
    setSummeEuro((vorschlagCents / 100).toFixed(2).replace('.', ','))
    setTyp('abschlag')
  }

  // "+ Element hinzufügen" (Baukasten-Referenz, 0054 rechnung_positionen):
  // solange keine Positionszeile einen Kurztext trägt, verhält sich das
  // Formular exakt wie zuvor - freie Summeneingabe inkl. Leistungsstand-
  // Vorschlag. Sobald mindestens eine Position ausgefüllt ist, wird die
  // Summe automatisch aus den Positionen berechnet (Feld read-only).
  const habenAusgefuellteEntwurfPositionen = rechnungPositionen.some((p) => p.kurztext.trim())
  const positionenSummeCents = rechnungPositionen.reduce((sum, p) => {
    if (!p.kurztext.trim()) return sum
    const menge = parseFloat(p.menge.replace(',', '.')) || 0
    const preisCents = euroZuCents(p.einzelpreisEuro || '0') || 0
    return sum + Math.round(menge * preisCents)
  }, 0)
  const effektiveSummeCents = habenAusgefuellteEntwurfPositionen ? positionenSummeCents : (euroZuCents(summeEuro || '0') || 0)

  function positionHinzufuegen() {
    setRechnungPositionen((prev) => [...prev, neuePositionsZeile()])
  }
  function positionAendern(id: string, feld: keyof RechnungPositionEntwurf, wert: string) {
    setRechnungPositionen((prev) => prev.map((p) => (p.id === id ? { ...p, [feld]: wert } : p)))
  }
  function positionEntfernen(id: string) {
    setRechnungPositionen((prev) => prev.filter((p) => p.id !== id))
  }
  function faelligkeitSetzen(tage: number) {
    const datum = new Date()
    datum.setDate(datum.getDate() + tage)
    setFaelligAm(datum.toISOString().slice(0, 10))
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (Number.isNaN(effektiveSummeCents) || !rechnungsnummer) return

    const { data: neueRechnung, error } = await supabase
      .from('rechnungen_ausgang')
      .insert({
        projekt_id: projektId,
        auftrag_id: auftragId || null,
        rechnungsnummer,
        typ,
        summe_netto_cents: effektiveSummeCents,
        mwst_satz: parseFloat(mwstSatz),
        faellig_am: faelligAm || null,
        bestellreferenz: bestellreferenz || null,
      })
      .select('id')
      .single()

    if (!error && neueRechnung) {
      const ausgefuellt = rechnungPositionen.filter((p) => p.kurztext.trim())
      if (ausgefuellt.length > 0) {
        await supabase.from('rechnung_positionen').insert(
          ausgefuellt.map((p, i) => ({
            rechnung_id: neueRechnung.id,
            kurztext: p.kurztext,
            menge: parseFloat(p.menge.replace(',', '.')) || 1,
            einheit: p.einheit || null,
            einzelpreis_cents: euroZuCents(p.einzelpreisEuro || '0') || 0,
            reihenfolge: i,
          })),
        )
      }
      setRechnungsnummer(''); setSummeEuro(''); setFaelligAm(''); setBestellreferenz(''); setRechnungPositionen([])
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
        <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 380px', minWidth: 300, position: 'sticky', top: 16 }}>
            <RechnungVorschau
              sprache={sprache}
              akzent={druckFirma?.akzentfarbe || '#C1552F'}
              logoUrl={druckFirma?.logo_url || null}
              firmenname={druckFirma?.name || ''}
              kundeName={projektFuerDruck?.kunde_name || ''}
              kundeAdresse={projektFuerDruck?.kunde_rechnungsadresse || null}
              rechnungsnummer={rechnungsnummer}
              typLabel={typLabel[typ]}
              faelligAm={faelligAm}
              bestellreferenz={bestellreferenz}
              positionen={rechnungPositionen}
              summeNettoCents={effektiveSummeCents}
              mwstSatz={parseFloat(mwstSatz) || 0}
            />
          </div>

          <form onSubmit={anlegen} style={{ ...karteStil, flex: '1 1 360px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--glass-border)', marginBottom: 4 }}>
              {(['details', 'stil'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setEditorTab(tab)}
                  style={{
                    all: 'unset', cursor: 'pointer', padding: '6px 4px 10px', fontSize: 13, fontWeight: 700,
                    color: editorTab === tab ? 'var(--olive)' : 'var(--ink-faint)',
                    borderBottom: editorTab === tab ? '2px solid var(--olive)' : '2px solid transparent',
                    marginRight: 16,
                  }}
                >
                  {tab === 'details' ? 'Details' : 'Stil'}
                </button>
              ))}
            </div>

            {editorTab === 'stil' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
                  Sprache des Dokuments
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['de', 'en'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSprache(s)}
                        style={sprache === s ? knopfStil : knopfSekundaerStil}
                      >
                        {s === 'de' ? 'Deutsch' : 'English'}
                      </button>
                    ))}
                  </div>
                </label>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>
                  Logo und Akzentfarbe gelten firmenweit für alle Rechnungen, Angebote und Mahnungen und
                  werden zentral in den Firmen-Einstellungen gepflegt{druckFirma?.akzentfarbe ? ' – aktuell:' : '.'}
                  {druckFirma?.akzentfarbe && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                      <span style={{ width: 14, height: 14, borderRadius: 4, background: druckFirma.akzentfarbe, display: 'inline-block', border: '1px solid var(--glass-border)' }} />
                      {druckFirma.akzentfarbe}
                    </span>
                  )}
                </p>
              </div>
            )}

            {editorTab === 'details' && (
              <>
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
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
                  Bestellreferenz (optional)
                  <input style={eingabeStil} value={bestellreferenz} onChange={(e) => setBestellreferenz(e.target.value)} placeholder="z.B. Bestellnummer des Kunden" />
                </label>
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
                    ) : lvPositionen.length === 0 ? (
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
                          {zeigeLeistungsstand ? '▲ Leistungsstand ausblenden' : `▼ Leistungsstand erfassen (${lvPositionen.length} Positionen)`}
                        </button>

                        {zeigeLeistungsstand && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {lvPositionen.map((p) => (
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
                            <button type="button" onClick={vorschlagUebernehmen} disabled={habenAusgefuellteEntwurfPositionen} style={{ ...knopfSekundaerStil, alignSelf: 'flex-start', fontSize: 11.5, padding: '6px 12px' }}>
                              Vorschlag in Summe übernehmen
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Positionen (optional)</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rechnungPositionen.map((p) => (
                      <div key={p.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          style={{ ...eingabeStil, flex: '2 1 140px', padding: '6px 8px' }}
                          placeholder="Kurztext"
                          value={p.kurztext}
                          onChange={(e) => positionAendern(p.id, 'kurztext', e.target.value)}
                        />
                        <input
                          style={{ ...eingabeStil, width: 60, padding: '6px 8px' }}
                          placeholder="Menge"
                          value={p.menge}
                          onChange={(e) => positionAendern(p.id, 'menge', e.target.value)}
                        />
                        <input
                          style={{ ...eingabeStil, width: 60, padding: '6px 8px' }}
                          placeholder="Einh."
                          value={p.einheit}
                          onChange={(e) => positionAendern(p.id, 'einheit', e.target.value)}
                        />
                        <input
                          style={{ ...eingabeStil, width: 90, padding: '6px 8px' }}
                          placeholder="€ / Einheit"
                          value={p.einzelpreisEuro}
                          onChange={(e) => positionAendern(p.id, 'einzelpreisEuro', e.target.value)}
                        />
                        <button type="button" onClick={() => positionEntfernen(p.id)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--red)', fontSize: 16, padding: '0 4px' }} title="Position entfernen">×</button>
                      </div>
                    ))}
                    <button type="button" onClick={positionHinzufuegen} style={{ ...knopfSekundaerStil, alignSelf: 'flex-start', fontSize: 12, padding: '6px 12px' }}>
                      + Element hinzufügen
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: 1 }}>
                    Summe netto (€){habenAusgefuellteEntwurfPositionen ? ' – aus Positionen berechnet' : ''}
                    <input
                      style={eingabeStil}
                      value={habenAusgefuellteEntwurfPositionen ? (positionenSummeCents / 100).toFixed(2).replace('.', ',') : summeEuro}
                      onChange={(e) => setSummeEuro(e.target.value)}
                      disabled={habenAusgefuellteEntwurfPositionen}
                      required={!habenAusgefuellteEntwurfPositionen}
                      placeholder="z.B. 4500"
                    />
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
                  Zahlungsziel
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <button type="button" onClick={() => faelligkeitSetzen(7)} style={knopfSekundaerStil}>7 Tage</button>
                    <button type="button" onClick={() => faelligkeitSetzen(14)} style={knopfSekundaerStil}>14 Tage</button>
                  </div>
                  <input type="date" style={eingabeStil} value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
                </label>
                <button type="submit" style={knopfStil}>Rechnung speichern</button>
              </>
            )}
          </form>
        </div>
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
                    {r.bestellreferenz ? ` · Best.-Ref. ${r.bestellreferenz}` : ''}
                  </div>
                  {r.faellig_am && (
                    <div style={{ fontSize: 12, color: istUeberfaellig ? 'var(--red)' : 'var(--ink-faint)', marginTop: 2 }}>
                      Fällig am {new Date(r.faellig_am).toLocaleDateString('de-DE')}{istUeberfaellig ? ' – überfällig' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                    {(['de', 'en'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDruckSprache((prev) => ({ ...prev, [r.id]: s }))}
                        style={{
                          all: 'unset', cursor: 'pointer', padding: '5px 8px', fontSize: 11, fontWeight: 700,
                          background: (druckSprache[r.id] ?? 'de') === s ? 'var(--olive)' : 'transparent',
                          color: (druckSprache[r.id] ?? 'de') === s ? '#fff' : 'var(--ink-faint)',
                        }}
                        title={s === 'de' ? 'Deutsch' : 'English'}
                      >
                        {s.toUpperCase()}
                      </button>
                    ))}
                  </div>
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
      <p className="footnote">
        Bewusst noch nicht umgesetzt aus dem "Baukasten"-Wunsch: QR-Code für die Zahlung (technisch ohne
        Zahlungsdienstleister möglich, aber ein korrekter QR-Code-Encoder lässt sich ohne Bibliothek und ohne
        Testgerät nur mit Risiko selbst schreiben – wird zurückgestellt), mehrere Währungen (die App rechnet
        durchgängig in Euro-Cent), Ratenzahlung/Teilbeträge sowie die Verknüpfung einer Rechnung mit einer
        echten Bankzahlung (laut Konzept Abschnitt 8.7 ohnehin erst mit einem lizenzierten Kontoinformations-
        Partner in einer späteren Phase geplant, nicht ad hoc umsetzbar).
      </p>
    </div>
  )
}
