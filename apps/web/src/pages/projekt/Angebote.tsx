import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil } from '../stil'
import { dokumentDrucken, angebotDruckHtml, type DruckFirma, type DruckPosition } from '../../lib/druckExport'

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

type LvStatus = 'offen' | 'angefragt' | 'entfallen'
type LvPosition = {
  id: string
  gewerk_id: string | null
  kurztext: string
  menge: number | null
  einheit: string | null
  einzelpreis_cents: number | null
  status: LvStatus
}

type KatalogPosition = { id: string; gewerk_id: string | null; kurztext: string; einheit: string | null; einzelpreis_cents: number }

type Nachtrag = {
  id: string
  auftrag_id: string
  titel: string
  beschreibung: string | null
  betrag_netto_cents: number
  status: 'eingereicht' | 'freigegeben' | 'abgelehnt'
  bauherr_status: 'nicht_erforderlich' | 'ausstehend' | 'freigegeben' | 'abgelehnt'
  erstellt_am: string
}

const nachtragStatusLabel: Record<Nachtrag['status'], string> = {
  eingereicht: 'Eingereicht',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt',
}

const bauherrFreigabeLabel: Record<Nachtrag['bauherr_status'], string> = {
  nicht_erforderlich: '',
  ausstehend: 'Bauherr: ausstehend',
  freigegeben: 'Bauherr: freigegeben',
  abgelehnt: 'Bauherr: abgelehnt',
}

type LvZeile = { lvPositionId: string; kurztext: string; menge: number; einheit: string | null; einzelpreisEuro: string }

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

function normalisiert(s: string) {
  return s.trim().toLowerCase()
}

export default function Angebote({ projektId, istEigentuemer }: { projektId: string; istEigentuemer: boolean }) {
  const { aktivFirma } = useAuth()
  const [angebote, setAngebote] = useState<Angebot[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [nachtraege, setNachtraege] = useState<Nachtrag[]>([])
  const [nachtragFormFuer, setNachtragFormFuer] = useState<string | null>(null)
  const [nachtragTitel, setNachtragTitel] = useState('')
  const [nachtragBeschreibung, setNachtragBeschreibung] = useState('')
  const [nachtragBetragEuro, setNachtragBetragEuro] = useState('')
  const [nachtragSpeichert, setNachtragSpeichert] = useState(false)
  const [nachtragFehler, setNachtragFehler] = useState<string | null>(null)
  const [nachtragEntscheidetGerade, setNachtragEntscheidetGerade] = useState<string | null>(null)
  const [firmenOptionen, setFirmenOptionen] = useState<Firma[]>([])
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [lvPositionen, setLvPositionen] = useState<LvPosition[]>([])
  const [katalog, setKatalog] = useState<KatalogPosition[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [erstellModus, setErstellModus] = useState<'manuell' | 'aus_lv'>('manuell')

  const [firmaId, setFirmaId] = useState('')
  const [gewerk, setGewerk] = useState('')
  const [summeEuro, setSummeEuro] = useState('')
  const [mwstSatz, setMwstSatz] = useState('19')
  const [gueltigBis, setGueltigBis] = useState('')

  const [lvGewerkId, setLvGewerkId] = useState('')
  const [lvZeilen, setLvZeilen] = useState<LvZeile[]>([])
  const [lvSpeichert, setLvSpeichert] = useState(false)
  const [lvFehler, setLvFehler] = useState<string | null>(null)
  const [kiZuordnungLaeuft, setKiZuordnungLaeuft] = useState(false)

  const [auftragFehler, setAuftragFehler] = useState<string | null>(null)
  const [auftragLaeuft, setAuftragLaeuft] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const [
      { data: angeboteData, error: angeboteFehler },
      { data: auftraegeData },
      { data: mitgliederData },
      { data: gewerkeData },
      { data: lvData },
      { data: katalogData },
      { data: nachtraegeData },
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
      supabase
        .from('lv_positionen')
        .select('id, gewerk_id, kurztext, menge, einheit, einzelpreis_cents, status')
        .eq('projekt_id', projektId)
        .eq('status', 'offen'),
      aktivFirma
        ? supabase.from('preiskatalog_positionen').select('id, gewerk_id, kurztext, einheit, einzelpreis_cents').eq('firma_id', aktivFirma.id)
        : Promise.resolve({ data: [] as KatalogPosition[] }),
      supabase
        .from('nachtraege')
        .select('id, auftrag_id, titel, beschreibung, betrag_netto_cents, status, bauherr_status, erstellt_am')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false }),
    ])

    if (angeboteFehler) { setLadeStatus('fehler'); return }
    setAngebote((angeboteData ?? []) as unknown as Angebot[])
    setAuftraege((auftraegeData ?? []) as unknown as Auftrag[])
    setGewerke(gewerkeData ?? [])
    setLvPositionen((lvData ?? []) as LvPosition[])
    setKatalog((katalogData ?? []) as KatalogPosition[])
    setNachtraege((nachtraegeData ?? []) as Nachtrag[])

    // Nur der Eigentümer (GU) kann ein Angebot im Namen einer anderen,
    // verknüpften Firma anlegen (z.B. wenn eine Firma noch keinen eigenen
    // Login hat). Eine teilnehmende Firma darf nur für sich selbst bieten.
    const verknuepfteFirmen = ((mitgliederData ?? []) as unknown as { firmen: Firma | null }[])
      .map((m) => m.firmen)
      .filter((f): f is Firma => Boolean(f))
    const alleFirmen = aktivFirma ? [aktivFirma, ...verknuepfteFirmen] : verknuepfteFirmen
    const eindeutig = istEigentuemer
      ? Array.from(new Map(alleFirmen.map((f) => [f.id, f])).values())
      : aktivFirma
      ? [aktivFirma]
      : []
    setFirmenOptionen(eindeutig)
    if (!firmaId && eindeutig.length > 0) setFirmaId(eindeutig[0].id)

    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId, aktivFirma?.id, istEigentuemer])

  // Projekt-Stammdaten für den PDF-Kopf (Name/Adresse) - separat geladen,
  // da sie im großen Promise.all oben nicht gebraucht werden.
  const [projektFuerDruck, setProjektFuerDruck] = useState<{ name: string; adresse: string | null } | null>(null)
  useEffect(() => {
    supabase
      .from('projekte')
      .select('name, adresse')
      .eq('id', projektId)
      .maybeSingle()
      .then(({ data }) => { if (data) setProjektFuerDruck(data) })
  }, [projektId])

  async function angebotDrucken(a: Angebot) {
    if (!a.firmen || !projektFuerDruck) return
    const [{ data: firmaData }, { data: posData }] = await Promise.all([
      supabase.from('firmen').select('name, rechtsform, adresse, ust_id, telefon, email, iban').eq('id', a.firmen.id).maybeSingle(),
      supabase
        .from('angebot_positionen')
        .select('kurztext, menge, einheit, einzelpreis_cents')
        .eq('angebot_id', a.id)
        .order('erstellt_am', { ascending: true }),
    ])
    if (!firmaData) return
    const html = angebotDruckHtml({
      angebotsnummer: `A-${new Date(a.erstellt_am).getFullYear()}-${a.id.slice(0, 6).toUpperCase()}`,
      gewerk: a.gewerk,
      erstelltAm: a.erstellt_am,
      gueltigBis: a.gueltig_bis,
      mwstSatz: a.mwst_satz,
      firma: firmaData as DruckFirma,
      projektName: projektFuerDruck.name,
      projektAdresse: projektFuerDruck.adresse,
      positionen: (posData ?? []) as DruckPosition[],
      summeNettoCents: a.summe_netto_cents,
    })
    dokumentDrucken(`Angebot ${a.firmen.name} – ${projektFuerDruck.name}`, html)
  }

  const gewerkeMitOffenenLv = useMemo(() => {
    const idsMitOffenen = new Set(lvPositionen.filter((p) => p.gewerk_id).map((p) => p.gewerk_id as string))
    return gewerke.filter((g) => idsMitOffenen.has(g.id))
  }, [lvPositionen, gewerke])

  useEffect(() => {
    if (!lvGewerkId) { setLvZeilen([]); return }
    const offene = lvPositionen.filter((p) => p.gewerk_id === lvGewerkId)
    const katalogByText = new Map(
      katalog.filter((k) => k.gewerk_id === lvGewerkId || k.gewerk_id === null).map((k) => [normalisiert(k.kurztext), k.einzelpreis_cents])
    )
    setLvZeilen(
      offene.map((p) => {
        const treffer = katalogByText.get(normalisiert(p.kurztext))
        const preisCents = treffer ?? p.einzelpreis_cents ?? null
        return {
          lvPositionId: p.id,
          kurztext: p.kurztext,
          menge: p.menge ?? 1,
          einheit: p.einheit,
          einzelpreisEuro: preisCents != null ? (preisCents / 100).toFixed(2).replace('.', ',') : '',
        }
      })
    )
  }, [lvGewerkId, lvPositionen, katalog])

  function lvZeilePreisAendern(index: number, wert: string) {
    setLvZeilen((zeilen) => zeilen.map((z, i) => (i === index ? { ...z, einzelpreisEuro: wert } : z)))
  }

  // KI-gestützte Zuordnung für Positionen, die die exakte Textübereinstimmung
  // oben nicht gefunden hat (Konzept Abschnitt 8.2/16 Phase 2, "automatisches
  // Angebot"): LV-Texte und der eigene Preiskatalog sind unabhängig
  // formuliert, treffen sich nach exakter Normalisierung selten. Schreibt
  // nichts direkt - füllt nur die (noch leeren) Preisfelder aus den bereits
  // geladenen, RLS-gelesenen Katalogpreisen, ganz wie die bestehende
  // Wortgleich-Zuordnung, nur mit KI statt exaktem Textvergleich.
  const [kiZuordnungFehler, setKiZuordnungFehler] = useState<string | null>(null)

  async function preiseKiZuordnen() {
    const offeneZeilen = lvZeilen.filter((z) => z.einzelpreisEuro.trim() === '')
    if (offeneZeilen.length === 0) return
    const relevanterKatalog = katalog.filter((k) => k.gewerk_id === lvGewerkId || k.gewerk_id === null)
    if (relevanterKatalog.length === 0) {
      setKiZuordnungFehler('Für dieses Gewerk liegt noch kein Preiskatalog vor – zuerst unter „Preiskatalog" Positionen anlegen.')
      return
    }
    setKiZuordnungLaeuft(true)
    setKiZuordnungFehler(null)
    const { data, error } = await supabase.functions.invoke('preiskatalog-abgleich', {
      body: {
        lvPositionen: offeneZeilen.map((z) => ({ id: z.lvPositionId, kurztext: z.kurztext, einheit: z.einheit })),
        katalogPositionen: relevanterKatalog.map((k) => ({ id: k.id, kurztext: k.kurztext, einheit: k.einheit })),
      },
    })
    setKiZuordnungLaeuft(false)
    if (error || data?.fehler) {
      setKiZuordnungFehler(data?.fehler ?? error?.message ?? 'Zuordnung fehlgeschlagen.')
      return
    }
    const katalogById = new Map(relevanterKatalog.map((k) => [k.id, k.einzelpreis_cents]))
    const zuordnungen = (data?.zuordnungen ?? []) as { lv_position_id: string; katalog_position_id: string }[]
    let anzahlGefunden = 0
    setLvZeilen((zeilen) =>
      zeilen.map((z) => {
        if (z.einzelpreisEuro.trim() !== '') return z
        const treffer = zuordnungen.find((zu) => zu.lv_position_id === z.lvPositionId)
        const preisCents = treffer?.katalog_position_id ? katalogById.get(treffer.katalog_position_id) : undefined
        if (preisCents == null) return z
        anzahlGefunden++
        return { ...z, einzelpreisEuro: (preisCents / 100).toFixed(2).replace('.', ',') }
      })
    )
    if (anzahlGefunden === 0) {
      setKiZuordnungFehler('Keine passenden Katalogpositionen gefunden – bitte Preise für die restlichen Positionen manuell eintragen.')
    }
  }

  const lvZeilenMitPreis = lvZeilen
    .map((z) => ({ ...z, preis: parseFloat(z.einzelpreisEuro.replace(',', '.')) }))
    .filter((z) => !Number.isNaN(z.preis))
  const lvSummeCents = lvZeilenMitPreis.reduce((summe, z) => summe + Math.round(z.menge * z.preis * 100), 0)
  const lvAnzahlOhnePreis = lvZeilen.length - lvZeilenMitPreis.length

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

  async function ausLvAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!firmaId || lvZeilenMitPreis.length === 0) {
      setLvFehler('Bitte mindestens für eine Position einen Preis angeben.')
      return
    }
    setLvSpeichert(true)
    setLvFehler(null)
    const gewerkName = gewerke.find((g) => g.id === lvGewerkId)?.name ?? null

    const { data: neuesAngebot, error } = await supabase
      .from('angebote')
      .insert({
        projekt_id: projektId,
        anbietende_firma_id: firmaId,
        gewerk: gewerkName,
        summe_netto_cents: lvSummeCents,
        mwst_satz: parseFloat(mwstSatz),
        gueltig_bis: gueltigBis || null,
      })
      .select('id')
      .single()

    if (error || !neuesAngebot) {
      setLvFehler('Konnte nicht gespeichert werden.')
      setLvSpeichert(false)
      return
    }

    await supabase.from('angebot_positionen').insert(
      lvZeilenMitPreis.map((z) => ({
        angebot_id: neuesAngebot.id,
        lv_position_id: z.lvPositionId,
        kurztext: z.kurztext,
        menge: z.menge,
        einheit: z.einheit,
        einzelpreis_cents: Math.round(z.preis * 100),
      }))
    )

    setLvGewerkId('')
    setLvZeilen([])
    setGueltigBis('')
    setZeigeFormular(false)
    setLvSpeichert(false)
    laden()
  }

  async function statusAendern(id: string, status: Angebot['status']) {
    await supabase.from('angebote').update({ status }).eq('id', id)
    laden()
  }

  async function auftragErstellen(angebot: Angebot) {
    if (!angebot.firmen || !aktivFirma) return
    setAuftragFehler(null)
    setAuftragLaeuft(angebot.id)

    // Freigabekompetenz vorab prüfen (Konzept Abschnitt 8.14): Inhaber/
    // Geschäftsführung dürfen immer, alle anderen nur bis zu ihrem
    // hinterlegten Freigabelimit - so bekommt der Nutzer eine verständliche
    // Meldung statt der kryptischen RLS-Fehlermeldung der Datenbank, die
    // dieselbe Regel als zweite, verbindliche Absicherung durchsetzt.
    if (aktivFirma.rolle !== 'inhaber' && aktivFirma.rolle !== 'geschaeftsfuehrung') {
      const { data: eigeneMitgliedschaft } = await supabase
        .from('firma_mitglieder')
        .select('freigabe_limit_cents')
        .eq('firma_id', aktivFirma.id)
        .eq('nutzer_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle()

      const limit = eigeneMitgliedschaft?.freigabe_limit_cents ?? null
      if (limit == null || limit < angebot.summe_netto_cents) {
        setAuftragFehler(
          limit == null
            ? 'Für dich ist kein Freigabelimit hinterlegt – bitte einen Inhaber/eine Geschäftsführung um Freigabe bitten (Team-Seite).'
            : `Dieser Auftrag (${centsZuEuroText(angebot.summe_netto_cents)}) übersteigt dein Freigabelimit von ${centsZuEuroText(limit)}. Bitte einen Inhaber/eine Geschäftsführung um Freigabe bitten.`
        )
        setAuftragLaeuft(null)
        return
      }
    }

    const { error } = await supabase.from('auftraege').insert({
      projekt_id: projektId,
      angebot_id: angebot.id,
      auftragnehmer_firma_id: angebot.firmen.id,
      summe_netto_cents: angebot.summe_netto_cents,
    })

    if (error) {
      setAuftragFehler(
        error.message.includes('row-level security')
          ? 'Auftrag konnte nicht erstellt werden – dein Freigabelimit reicht dafür nicht aus.'
          : `Auftrag erstellen fehlgeschlagen: ${error.message}`
      )
      setAuftragLaeuft(null)
      return
    }

    // Automatische To-do-Liste aus der Ausschreibung (Konzept Abschnitt 16,
    // Phase 2): wurde das Angebot aus dem Leistungsverzeichnis erstellt,
    // liegen dazu Angebotspositionen vor - jede wird direkt als Aufgabe
    // übernommen, statt dass die ausführende Firma die Liste von Hand
    // nachbaut. Manuell erstellte Angebote haben keine Positionen und
    // erzeugen bewusst keine Aufgaben, da es dafür keine strukturierte
    // Grundlage gibt.
    const { data: positionenData } = await supabase
      .from('angebot_positionen')
      .select('kurztext, menge, einheit')
      .eq('angebot_id', angebot.id)

    if (positionenData && positionenData.length > 0) {
      await supabase.from('aufgaben').insert(
        positionenData.map((p) => ({
          projekt_id: projektId,
          titel: p.kurztext,
          beschreibung: `${p.menge}${p.einheit ? ' ' + p.einheit : ''} · automatisch aus dem Angebot übernommen`,
          gewerk: angebot.gewerk,
        }))
      )
    }

    setAuftragLaeuft(null)
    laden()
  }

  async function auftragStatusAendern(id: string, status: Auftrag['status']) {
    await supabase.from('auftraege').update({ status }).eq('id', id)
    laden()
  }

  const angebotHatAuftrag = (angebotId: string) => auftraege.some((a) => a.angebot_id === angebotId)

  async function nachtragEinreichen(auftragId: string) {
    const betragCents = Math.round(parseFloat(nachtragBetragEuro.replace(',', '.')) * 100)
    if (!nachtragTitel.trim() || Number.isNaN(betragCents)) {
      setNachtragFehler('Bitte Titel und Betrag angeben (Minderleistung als negativer Betrag, z.B. -450).')
      return
    }
    setNachtragSpeichert(true)
    setNachtragFehler(null)
    const { error } = await supabase.from('nachtraege').insert({
      projekt_id: projektId,
      auftrag_id: auftragId,
      titel: nachtragTitel.trim(),
      beschreibung: nachtragBeschreibung.trim() || null,
      betrag_netto_cents: betragCents,
    })
    setNachtragSpeichert(false)
    if (error) { setNachtragFehler(error.message); return }
    setNachtragFormFuer(null)
    setNachtragTitel('')
    setNachtragBeschreibung('')
    setNachtragBetragEuro('')
    laden()
  }

  async function nachtragEntscheiden(id: string, freigeben: boolean) {
    setNachtragEntscheidetGerade(id)
    setNachtragFehler(null)
    const { error } = await supabase.rpc('nachtrag_entscheiden', { p_nachtrag_id: id, p_freigeben: freigeben })
    setNachtragEntscheidetGerade(null)
    if (error) { setNachtragFehler(error.message); return }
    laden()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Angebot'}
        </button>
      </div>

      {zeigeFormular && (
        <div style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setErstellModus('manuell')}
              style={erstellModus === 'manuell' ? knopfStil : knopfSekundaerStil}
            >
              Manuell
            </button>
            <button
              type="button"
              onClick={() => setErstellModus('aus_lv')}
              style={erstellModus === 'aus_lv' ? knopfStil : knopfSekundaerStil}
            >
              Aus Leistungsverzeichnis
            </button>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Anbietende Firma
            {istEigentuemer ? (
              <select style={eingabeStil} value={firmaId} onChange={(e) => setFirmaId(e.target.value)} required>
                {firmenOptionen.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{aktivFirma?.name ?? '–'}</span>
            )}
          </label>

          {erstellModus === 'manuell' ? (
            <form onSubmit={anlegen} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          ) : (
            <form onSubmit={ausLvAnlegen} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
                Gewerk
                <select style={eingabeStil} value={lvGewerkId} onChange={(e) => setLvGewerkId(e.target.value)} required>
                  <option value="">– wählen –</option>
                  {gewerkeMitOffenenLv.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>

              {gewerkeMitOffenenLv.length === 0 && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>
                  Keine offenen Leistungsverzeichnis-Positionen mit Gewerk in diesem Projekt – lege sie im Tab
                  „Ausschreibung & LV" an.
                </p>
              )}

              {lvGewerkId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lvZeilen.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>Keine offenen Positionen für dieses Gewerk.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)' }}>
                          Positionen aus dem Leistungsverzeichnis – Preise ggf. anpassen
                        </div>
                        {lvZeilen.some((z) => z.einzelpreisEuro.trim() === '') && (
                          <button
                            type="button"
                            style={{ ...knopfSekundaerStil, fontSize: 11, padding: '5px 10px' }}
                            disabled={kiZuordnungLaeuft}
                            onClick={preiseKiZuordnen}
                          >
                            {kiZuordnungLaeuft ? 'Gleicht ab …' : '✨ Restliche Preise per KI aus Katalog übernehmen'}
                          </button>
                        )}
                      </div>
                      {kiZuordnungFehler && (
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>{kiZuordnungFehler}</p>
                      )}
                      {lvZeilen.map((z, i) => (
                        <div key={z.lvPositionId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ flex: '2 1 200px', fontSize: 12.5 }}>{z.kurztext}</span>
                          <span style={{ flex: '0 0 90px', fontSize: 12, color: 'var(--ink-faint)' }}>
                            {z.menge} {z.einheit ?? ''}
                          </span>
                          <input
                            style={{ ...eingabeStil, width: 100 }}
                            value={z.einzelpreisEuro}
                            onChange={(e) => lvZeilePreisAendern(i, e.target.value)}
                            placeholder="€ / Einheit"
                          />
                        </div>
                      ))}
                      <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', marginTop: 4 }}>
                        Summe: {euro.format(lvSummeCents / 100)} netto
                      </div>
                      {lvAnzahlOhnePreis > 0 && (
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)', textAlign: 'right' }}>
                          {lvAnzahlOhnePreis} Position{lvAnzahlOhnePreis === 1 ? '' : 'en'} ohne Preis wird nicht übernommen
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', width: 110 }}>
                  MwSt.
                  <select style={eingabeStil} value={mwstSatz} onChange={(e) => setMwstSatz(e.target.value)}>
                    <option value="19">19 %</option>
                    <option value="7">7 %</option>
                    <option value="0">0 %</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: 1 }}>
                  Gültig bis (optional)
                  <input type="date" style={eingabeStil} value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} />
                </label>
              </div>

              {lvFehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{lvFehler}</p>}

              <button type="submit" style={knopfStil} disabled={lvSpeichert || lvZeilenMitPreis.length === 0}>
                {lvSpeichert ? 'Speichert …' : 'Angebot aus Leistungsverzeichnis erstellen'}
              </button>
            </form>
          )}
        </div>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Angebote …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Angebote konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && angebote.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Angebote.</p>
      )}

      {auftragFehler && (
        <div style={{ ...karteStil, marginBottom: 14, padding: '12px 16px', borderColor: 'var(--red)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{auftragFehler}</p>
        </div>
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
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => angebotDrucken(a)}
                      disabled={!projektFuerDruck}
                      style={{ ...knopfSekundaerStil, fontSize: 12, padding: '6px 12px' }}
                      title="Als PDF drucken/speichern"
                    >
                      PDF
                    </button>
                    <select
                      style={{ ...eingabeStil, fontSize: 13, padding: '6px 10px' }}
                      value={a.status}
                      onChange={(e) => statusAendern(a.id, e.target.value as Angebot['status'])}
                    >
                      {Object.entries(statusLabel)
                        .filter(([wert]) => istEigentuemer || wert === 'entwurf' || wert === 'versendet')
                        .map(([wert, label]) => (
                          <option key={wert} value={wert}>{label}</option>
                        ))}
                    </select>
                  </div>
                  {istEigentuemer && a.status === 'angenommen' && !angebotHatAuftrag(a.id) && (
                    <button
                      style={{ ...knopfStil, fontSize: 12, padding: '6px 10px' }}
                      disabled={auftragLaeuft === a.id}
                      onClick={() => auftragErstellen(a)}
                    >
                      {auftragLaeuft === a.id ? 'Prüft Freigabe …' : 'Auftrag erstellen'}
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
            {auftraege.map((au) => {
              const eigeneNachtraege = nachtraege.filter((n) => n.auftrag_id === au.id)
              const darfNachtragEinreichen = istEigentuemer || (!!aktivFirma && aktivFirma.id === au.firmen?.id)
              const formOffenFuerDiesen = nachtragFormFuer === au.id
              return (
                <div key={au.id} style={{ ...karteStil, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

                  {eigeneNachtraege.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--glass-border)', paddingTop: 10 }}>
                      {eigeneNachtraege.map((n) => (
                        <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                              {n.titel} · {n.betrag_netto_cents >= 0 ? '+' : ''}{centsZuEuroText(n.betrag_netto_cents)}
                            </div>
                            {n.beschreibung && <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>{n.beschreibung}</div>}
                          </div>
                          <span
                            style={{
                              fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                              color: n.status === 'freigegeben' ? '#2B5A34' : n.status === 'abgelehnt' ? 'var(--red)' : 'var(--orange-text)',
                              background: n.status === 'freigegeben' ? 'color-mix(in oklab, #3F7D4A 16%, transparent)' : n.status === 'abgelehnt' ? 'color-mix(in oklab, var(--red) 15%, transparent)' : 'color-mix(in oklab, var(--orange) 16%, transparent)',
                            }}
                          >
                            {nachtragStatusLabel[n.status]}
                          </span>
                          {n.bauherr_status !== 'nicht_erforderlich' && (
                            <span
                              title="Getrennte Freigabe durch den Bauherrn - beeinflusst diese interne Freigabe (noch) nicht"
                              style={{
                                fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                                color: n.bauherr_status === 'freigegeben' ? '#2B5A34' : n.bauherr_status === 'abgelehnt' ? 'var(--red)' : 'var(--ink-faint)',
                                background: 'transparent', border: '1px solid var(--glass-border)',
                              }}
                            >
                              {bauherrFreigabeLabel[n.bauherr_status]}
                            </span>
                          )}
                          {istEigentuemer && n.status === 'eingereicht' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--olive)' }}
                                disabled={nachtragEntscheidetGerade === n.id}
                                onClick={() => nachtragEntscheiden(n.id, true)}
                              >
                                Freigeben
                              </button>
                              <button
                                style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--red)' }}
                                disabled={nachtragEntscheidetGerade === n.id}
                                onClick={() => nachtragEntscheiden(n.id, false)}
                              >
                                Ablehnen
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {darfNachtragEinreichen && (
                    <div style={{ borderTop: eigeneNachtraege.length > 0 ? 'none' : '1px solid var(--glass-border)', paddingTop: eigeneNachtraege.length > 0 ? 0 : 10 }}>
                      {formOffenFuerDiesen ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <input style={{ ...eingabeStil, flex: '2 1 180px' }} placeholder="Titel, z.B. Zusätzliche Steckdosen" value={nachtragTitel} onChange={(e) => setNachtragTitel(e.target.value)} />
                            <input style={{ ...eingabeStil, flex: '1 1 120px' }} placeholder="Betrag netto (€)" value={nachtragBetragEuro} onChange={(e) => setNachtragBetragEuro(e.target.value)} />
                          </div>
                          <input style={eingabeStil} placeholder="Beschreibung/Grund (optional)" value={nachtragBeschreibung} onChange={(e) => setNachtragBeschreibung(e.target.value)} />
                          {nachtragFehler && <p style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{nachtragFehler}</p>}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ ...knopfStil, fontSize: 12, padding: '6px 12px' }} disabled={nachtragSpeichert} onClick={() => nachtragEinreichen(au.id)}>
                              {nachtragSpeichert ? 'Speichert …' : 'Nachtrag einreichen'}
                            </button>
                            <button
                              style={{ ...knopfSekundaerStil, fontSize: 12, padding: '6px 12px' }}
                              onClick={() => { setNachtragFormFuer(null); setNachtragFehler(null) }}
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: 'var(--orange-text)' }}
                          onClick={() => { setNachtragFormFuer(au.id); setNachtragTitel(''); setNachtragBeschreibung(''); setNachtragBetragEuro(''); setNachtragFehler(null) }}
                        >
                          + Nachtrag einreichen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
