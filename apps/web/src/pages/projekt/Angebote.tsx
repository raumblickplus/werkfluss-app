import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil } from '../stil'

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

type KatalogPosition = { gewerk_id: string | null; kurztext: string; einzelpreis_cents: number }

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

export default function Angebote({ projektId }: { projektId: string }) {
  const { aktivFirma } = useAuth()
  const [angebote, setAngebote] = useState<Angebot[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
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

  async function laden() {
    setLadeStatus('laedt')
    const [
      { data: angeboteData, error: angeboteFehler },
      { data: auftraegeData },
      { data: mitgliederData },
      { data: gewerkeData },
      { data: lvData },
      { data: katalogData },
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
        ? supabase.from('preiskatalog_positionen').select('gewerk_id, kurztext, einzelpreis_cents').eq('firma_id', aktivFirma.id)
        : Promise.resolve({ data: [] as KatalogPosition[] }),
    ])

    if (angeboteFehler) { setLadeStatus('fehler'); return }
    setAngebote((angeboteData ?? []) as unknown as Angebot[])
    setAuftraege((auftraegeData ?? []) as unknown as Auftrag[])
    setGewerke(gewerkeData ?? [])
    setLvPositionen((lvData ?? []) as LvPosition[])
    setKatalog((katalogData ?? []) as KatalogPosition[])

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
    if (!angebot.firmen) return
    const { error } = await supabase.from('auftraege').insert({
      projekt_id: projektId,
      angebot_id: angebot.id,
      auftragnehmer_firma_id: angebot.firmen.id,
      summe_netto_cents: angebot.summe_netto_cents,
    })

    // Automatische To-do-Liste aus der Ausschreibung (Konzept Abschnitt 16,
    // Phase 2): wurde das Angebot aus dem Leistungsverzeichnis erstellt,
    // liegen dazu Angebotspositionen vor - jede wird direkt als Aufgabe
    // übernommen, statt dass die ausführende Firma die Liste von Hand
    // nachbaut. Manuell erstellte Angebote haben keine Positionen und
    // erzeugen bewusst keine Aufgaben, da es dafür keine strukturierte
    // Grundlage gibt.
    if (!error) {
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
    }

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
            <select style={eingabeStil} value={firmaId} onChange={(e) => setFirmaId(e.target.value)} required>
              {firmenOptionen.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
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
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)' }}>
                        Positionen aus dem Leistungsverzeichnis – Preise ggf. anpassen
                      </div>
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
