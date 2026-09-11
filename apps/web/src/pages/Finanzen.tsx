import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, pillStil, projektStatusLabel, projektStatusVariante, eingabeStil, knopfStil, knopfSekundaerStil } from './stil'

type Tab = 'uebersicht' | 'buchhaltung' | 'steuern'
const tabs: { key: Tab; label: string }[] = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'buchhaltung', label: 'Buchhaltung' },
  { key: 'steuern', label: 'Steuern' },
]

type ProjektZeile = { id: string; name: string; status: string; kunde_rechnungsadresse: string | null }
type Angebot = {
  id: string
  projekt_id: string
  gewerk: string | null
  summe_netto_cents: number
  mwst_satz: number
  status: 'entwurf' | 'versendet' | 'angenommen' | 'abgelehnt'
  gueltig_bis: string | null
}
type Auftrag = { id: string; projekt_id: string; summe_netto_cents: number; status: 'aktiv' | 'abgeschlossen' | 'storniert' }
type Rechnung = {
  id: string
  projekt_id: string
  rechnungsnummer: string
  typ: 'abschlag' | 'schluss' | 'sonstige'
  summe_netto_cents: number
  mwst_satz: number
  status: 'offen' | 'bezahlt' | 'ueberfaellig' | 'storniert'
  faellig_am: string | null
  mahnstufe: number
  mahnstufe_gesetzt_am: string | null
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
function brutto(cents: number, satz: number) { return Math.round(cents * (1 + satz / 100)) }
function summeBrutto(zeilen: { summe_netto_cents: number; mwst_satz: number }[]) {
  return zeilen.reduce((summe, z) => summe + brutto(z.summe_netto_cents, z.mwst_satz), 0)
}
function summeNetto(zeilen: { summe_netto_cents: number }[]) {
  return zeilen.reduce((summe, z) => summe + z.summe_netto_cents, 0)
}
function formatKurz(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const mahnstufeLabel: Record<number, string> = {
  0: 'Keine Mahnung',
  1: 'Zahlungserinnerung',
  2: '1. Mahnung',
  3: '2. Mahnung',
}

function tageSeit(iso: string): number {
  const faellig = new Date(iso)
  const heute = new Date()
  return Math.max(0, Math.round((heute.getTime() - faellig.getTime()) / (1000 * 60 * 60 * 24)))
}

function neueFristDatum(tageAbHeute: number): string {
  const d = new Date()
  d.setDate(d.getDate() + tageAbHeute)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function mahnschreibenText(
  firmenname: string,
  kundenAdresse: string | null,
  rechnungsnummer: string,
  betragBrutto: string,
  faelligAm: string,
  tageUeberfaellig: number,
  naechsteStufe: number
): string {
  const anschrift = kundenAdresse ? `${kundenAdresse}\n\n` : ''
  if (naechsteStufe <= 1) {
    return `${anschrift}Sehr geehrte Damen und Herren,\n\nfuer unsere Rechnung ${rechnungsnummer} ueber ${betragBrutto} mit Faelligkeit am ${faelligAm} konnten wir bislang keinen Zahlungseingang feststellen. Moeglicherweise haben Sie die Zahlung bereits veranlasst - in diesem Fall betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nSollte dies nicht der Fall sein, bitten wir um Ausgleich bis zum ${neueFristDatum(10)}.\n\nMit freundlichen Gruessen\n${firmenname}`
  }
  if (naechsteStufe === 2) {
    return `${anschrift}Sehr geehrte Damen und Herren,\n\ntrotz unserer Zahlungserinnerung ist die Rechnung ${rechnungsnummer} ueber ${betragBrutto} (faellig seit ${faelligAm}, ${tageUeberfaellig} Tage ueberfaellig) weiterhin offen. Wir mahnen den Betrag hiermit an und bitten um Zahlung bis zum ${neueFristDatum(7)}.\n\nSollte der Ausgleich bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nMit freundlichen Gruessen\n${firmenname}`
  }
  return `${anschrift}Sehr geehrte Damen und Herren,\n\nauch nach unserer 1. Mahnung ist die Rechnung ${rechnungsnummer} ueber ${betragBrutto} (faellig seit ${faelligAm}, ${tageUeberfaellig} Tage ueberfaellig) nicht ausgeglichen. Wir setzen Ihnen hiermit eine letzte Frist bis zum ${neueFristDatum(7)}. Nach fruchtlosem Fristablauf behalten wir uns weitere Schritte (z. B. gerichtliches Mahnverfahren) sowie die Geltendmachung von Verzugszinsen und Mahnkosten vor.\n\nMit freundlichen Gruessen\n${firmenname}`
}

function EuroIcon({ groesse = 38 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.9 8.3a4.5 4.5 0 1 0 0 7.4" />
      <path d="M6.6 10.4h6.3M6.6 13.4h5.5" />
    </svg>
  )
}

function WarnBlockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v5M12 16.2v.01" />
    </svg>
  )
}

export default function Finanzen() {
  const { aktivFirma } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabAusUrl = searchParams.get('tab') as Tab | null
  const [aktivTab, setAktivTab] = useState<Tab>(
    tabAusUrl && tabs.some((t) => t.key === tabAusUrl) ? tabAusUrl : 'uebersicht'
  )

  // Bugfix (11.09.2026, Julian-Meldung): react-router mountet diese Seite bei
  // einer reinen Query-Param-Änderung (z.B. Klick auf "Buchhaltung" in der
  // Sidebar, während man schon auf /finanzen ist) nicht neu - der obige
  // useState-Initialwert griff dann nur beim allerersten Laden, ein Klick
  // von außen auf einen anderen Tab hat sichtbar gar nichts mehr getan.
  // Dieser Effekt hält aktivTab mit der URL synchron, auch nach dem ersten Mount.
  useEffect(() => {
    setAktivTab(tabAusUrl && tabs.some((t) => t.key === tabAusUrl) ? tabAusUrl : 'uebersicht')
  }, [tabAusUrl])

  function tabWechseln(tab: Tab) {
    setAktivTab(tab)
    setSearchParams(tab === 'uebersicht' ? {} : { tab }, { replace: true })
  }

  const [projekte, setProjekte] = useState<ProjektZeile[]>([])
  const [angebote, setAngebote] = useState<Angebot[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: pData }, { data: anData }, { data: auData }, { data: rData }] = await Promise.all([
      supabase.from('projekte').select('id, name, status, kunde_rechnungsadresse'),
      supabase.from('angebote').select('id, projekt_id, gewerk, summe_netto_cents, mwst_satz, status, gueltig_bis'),
      supabase.from('auftraege').select('id, projekt_id, summe_netto_cents, status'),
      supabase
        .from('rechnungen_ausgang')
        .select('id, projekt_id, rechnungsnummer, typ, summe_netto_cents, mwst_satz, status, faellig_am, mahnstufe, mahnstufe_gesetzt_am')
        .order('faellig_am', { ascending: true, nullsFirst: false }),
    ])
    setProjekte((pData ?? []) as ProjektZeile[])
    setAngebote((anData ?? []) as Angebot[])
    setAuftraege((auData ?? []) as Auftrag[])
    setRechnungen((rData ?? []) as Rechnung[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [])

  async function alsBezahltMarkieren(id: string) {
    setRechnungen((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'bezahlt' } : r)))
    await supabase.from('rechnungen_ausgang').update({ status: 'bezahlt' }).eq('id', id)
  }

  const heuteIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const projektName = (id: string) => projekte.find((p) => p.id === id)?.name ?? 'Unbekanntes Projekt'
  const projektAdresse = (id: string) => projekte.find((p) => p.id === id)?.kunde_rechnungsadresse ?? null
  const istUeberfaellig = (r: Rechnung) => r.status === 'ueberfaellig' || (r.status === 'offen' && !!r.faellig_am && r.faellig_am < heuteIso)

  const [mahnungOffenFuer, setMahnungOffenFuer] = useState<string | null>(null)
  const [mahnungKopiert, setMahnungKopiert] = useState(false)
  const [mahnstufeSpeichert, setMahnstufeSpeichert] = useState(false)

  async function mahnstufeSetzen(rechnungId: string, neueStufe: number) {
    setMahnstufeSpeichert(true)
    setRechnungen((prev) => prev.map((r) => (r.id === rechnungId ? { ...r, mahnstufe: neueStufe, mahnstufe_gesetzt_am: heuteIso } : r)))
    await supabase.from('rechnungen_ausgang').update({ mahnstufe: neueStufe, mahnstufe_gesetzt_am: heuteIso }).eq('id', rechnungId)
    setMahnstufeSpeichert(false)
    setMahnungOffenFuer(null)
    setMahnungKopiert(false)
  }

  async function mahntextKopieren(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setMahnungKopiert(true)
    } catch {
      // Zwischenablage evtl. ohne Berechtigung - Text steht trotzdem sichtbar da.
    }
  }

  const offeneRechnungen = rechnungen.filter((r) => r.status === 'offen' || r.status === 'ueberfaellig')
  const ueberfaelligeRechnungen = offeneRechnungen.filter(istUeberfaellig)
  const offeneForderungenCents = summeBrutto(offeneRechnungen)
  const ueberfaelligeSummeCents = summeBrutto(ueberfaelligeRechnungen)
  const aktiveAuftraege = auftraege.filter((a) => a.status === 'aktiv')
  const aktiveAuftragsSummeCents = summeNetto(aktiveAuftraege)
  const angeboteVersendet = angebote.filter((a) => a.status === 'versendet')
  const angeboteVersendetSummeCents = summeBrutto(angeboteVersendet)

  const offeneRechnungenSortiert = [...offeneRechnungen].sort((a, b) => {
    if (istUeberfaellig(a) !== istUeberfaellig(b)) return istUeberfaellig(a) ? -1 : 1
    return (a.faellig_am ?? '9999') < (b.faellig_am ?? '9999') ? -1 : 1
  })

  const angeboteVersendetSortiert = [...angeboteVersendet].sort((a, b) => (a.gueltig_bis ?? '9999') < (b.gueltig_bis ?? '9999') ? -1 : 1)

  const projekteMitFinanzen = projekte.filter(
    (p) => angebote.some((a) => a.projekt_id === p.id) || auftraege.some((a) => a.projekt_id === p.id) || rechnungen.some((r) => r.projekt_id === p.id)
  )

  const heroText = useMemo(() => {
    const angeboteHinweis = angeboteVersendet.length > 0
      ? `${angeboteVersendet.length} Angebot${angeboteVersendet.length === 1 ? '' : 'e'} warten noch auf Rückmeldung`
      : ''
    if (ueberfaelligeRechnungen.length > 0) {
      return {
        titel: `${ueberfaelligeRechnungen.length} überfällige Rechnung${ueberfaelligeRechnungen.length === 1 ? '' : 'en'}.`,
        subtitel: `${euro.format(ueberfaelligeSummeCents / 100)} sind seit dem Fälligkeitsdatum offen${angeboteHinweis ? ` · ${angeboteHinweis}` : ''}.`,
      }
    }
    if (offeneRechnungen.length > 0) {
      return {
        titel: `${offeneRechnungen.length} offene Rechnung${offeneRechnungen.length === 1 ? '' : 'en'}, alles im Zeitplan.`,
        subtitel: `${euro.format(offeneForderungenCents / 100)} ausstehend, noch nichts überfällig${angeboteHinweis ? ` · ${angeboteHinweis}` : ''}.`,
      }
    }
    return {
      titel: 'Keine offenen Rechnungen.',
      subtitel: angeboteHinweis
        ? `${angeboteHinweis} – sonst ist gerade alles beglichen.`
        : 'Alles beglichen, keine Angebote in Prüfung – guter Zeitpunkt für einen Blick auf neue Ausschreibungen.',
    }
  }, [ueberfaelligeRechnungen.length, ueberfaelligeSummeCents, offeneRechnungen.length, offeneForderungenCents, angeboteVersendet.length])

  // Finanzen/Buchhaltung sind auf der Datenbank-Ebene bereits auf
  // finanziell Berechtigte beschränkt (hat_finanz_zugriff, 0022_mitarbeiter_
  // rechte.sql) - dieser Frontend-Guard verhindert nur, dass jemand ohne
  // diese Rolle eine leere/kaputte Seite statt einer klaren Erklärung sieht.
  const hatFinanzZugriff = !!aktivFirma && ['inhaber', 'geschaeftsfuehrung', 'finanzen'].includes(aktivFirma.rolle)
  if (!hatFinanzZugriff) {
    return (
      <AppShell title="Finanzen" subtitle={aktivFirma?.name}>
        <p style={{ color: 'var(--ink-faint)' }}>
          Dieser Bereich ist auf Inhaber, Geschäftsführung und die Rolle „Finanzen" beschränkt.
        </p>
      </AppShell>
    )
  }

  return (
    <AppShell title="Finanzen" subtitle={aktivFirma?.name} wide>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab${aktivTab === t.key ? ' active' : ''}`} onClick={() => tabWechseln(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {aktivTab === 'uebersicht' && (
        ladeStatus === 'laedt' ? (
          <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 14 }}>
              <div className="block olive-deep" style={{ gridColumn: 'span 7', minWidth: 260 }}>
                <div className="block-ticks" />
                <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <EuroIcon groesse={14} />
                  {new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })} &middot; Offene Forderungen
                </div>
                <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{euro.format(offeneForderungenCents / 100)}</div>
                <div className="block-sub">{heroText.titel}</div>
              </div>
              <div className={`block ${ueberfaelligeSummeCents > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 5', minWidth: 220 }}>
                <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {ueberfaelligeSummeCents > 0 && <WarnBlockIcon />}
                  {ueberfaelligeSummeCents > 0 ? 'Überfällig' : 'Alles im Zeitplan'}
                </div>
                <div className="block-num" style={{ fontSize: 'clamp(30px, 3.2vw, 48px)' }}>{euro.format(ueberfaelligeSummeCents / 100)}</div>
                <div className="block-sub">{heroText.subtitel}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 24 }}>
              <div className="block mustard" style={{ gridColumn: 'span 3', minWidth: 160 }}>
                <div className="block-lbl">Aktive Aufträge (netto)</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{euro.format(aktiveAuftragsSummeCents / 100)}</div>
              </div>
              <div className="block olive" style={{ gridColumn: 'span 3', minWidth: 160 }}>
                <div className="block-lbl">Angebote in Prüfung</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{euro.format(angeboteVersendetSummeCents / 100)}</div>
              </div>
              <div className="block cream" style={{ gridColumn: 'span 3', minWidth: 160 }}>
                <div className="block-lbl">Rechnungen offen</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(offeneRechnungen.length)}</div>
              </div>
              <div className="block dark" style={{ gridColumn: 'span 3', minWidth: 160 }}>
                <div className="block-lbl">Projekte mit Finanzdaten</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(projekteMitFinanzen.length)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 20, marginBottom: 24 }}>
              <div style={karteStil}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Offene &amp; überfällige Rechnungen</h2>
                {offeneRechnungenSortiert.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Keine offenen Rechnungen – alles bezahlt.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {offeneRechnungenSortiert.map((r) => {
                      const ueberf = istUeberfaellig(r)
                      const naechsteStufe = Math.min(3, r.mahnstufe + 1)
                      const mahnungOffen = mahnungOffenFuer === r.id
                      const mahntext = r.faellig_am
                        ? mahnschreibenText(
                            aktivFirma?.name ?? '',
                            projektAdresse(r.projekt_id),
                            r.rechnungsnummer,
                            euro.format(brutto(r.summe_netto_cents, r.mwst_satz) / 100),
                            formatKurz(r.faellig_am),
                            tageSeit(r.faellig_am),
                            naechsteStufe
                          )
                        : ''
                      return (
                        <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <Link to={`/projekte/${r.projekt_id}?tab=rechnungen`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--ink)' }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.rechnungsnummer} · {euro.format(brutto(r.summe_netto_cents, r.mwst_satz) / 100)}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {projektName(r.projekt_id)}
                              </div>
                            </Link>
                            {r.faellig_am && <span style={pillStil(ueberf ? 'bad' : 'neutral')}>{formatKurz(r.faellig_am)}</span>}
                            {r.mahnstufe > 0 && <span style={pillStil('warn')}>{mahnstufeLabel[r.mahnstufe]}</span>}
                            {ueberf && (
                              <button
                                onClick={() => { setMahnungOffenFuer(mahnungOffen ? null : r.id); setMahnungKopiert(false) }}
                                title="Mahnung vorbereiten"
                                style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: mahnungOffen ? 'var(--olive)' : 'transparent', color: mahnungOffen ? '#fff' : 'var(--orange-text)', whiteSpace: 'nowrap' }}
                              >
                                Mahnung
                              </button>
                            )}
                            <button
                              onClick={() => alsBezahltMarkieren(r.id)}
                              title="Als bezahlt markieren"
                              style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--olive)', whiteSpace: 'nowrap' }}
                            >
                              Bezahlt ✓
                            </button>
                          </div>
                          {mahnungOffen && r.faellig_am && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,.03)' }}>
                              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-faint)' }}>
                                {tageSeit(r.faellig_am)} Tage überfällig · nächste Stufe: <strong>{mahnstufeLabel[naechsteStufe]}</strong>
                              </p>
                              <textarea
                                readOnly
                                value={mahntext}
                                onFocus={(e) => e.target.select()}
                                style={{ width: '100%', minHeight: 140, fontSize: 12, fontFamily: 'inherit', padding: 8, borderRadius: 8, border: '1px solid var(--glass-border)', resize: 'vertical' }}
                              />
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => mahntextKopieren(mahntext)}
                                  style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'transparent' }}
                                >
                                  {mahnungKopiert ? 'Kopiert ✓' : 'Text kopieren'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => mahnstufeSetzen(r.id, naechsteStufe)}
                                  disabled={mahnstufeSpeichert}
                                  style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: 'none', background: 'var(--olive)', color: '#fff' }}
                                >
                                  Als verschickt markieren ({mahnstufeLabel[naechsteStufe]})
                                </button>
                                <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Versand (E-Mail/Post) erfolgt außerhalb von Werkfluss.</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div style={karteStil}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Angebote in Prüfung</h2>
                {angeboteVersendetSortiert.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Keine versendeten Angebote, die auf Antwort warten.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {angeboteVersendetSortiert.map((a) => (
                      <Link
                        key={a.id}
                        to={`/projekte/${a.projekt_id}?tab=angebote`}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)' }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {euro.format(brutto(a.summe_netto_cents, a.mwst_satz) / 100)}{a.gewerk ? ` · ${a.gewerk}` : ''}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {projektName(a.projekt_id)}
                          </div>
                        </div>
                        {a.gueltig_bis && <span style={pillStil('neutral')}>bis {formatKurz(a.gueltig_bis)}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...karteStil, overflowX: 'auto' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Finanzen je Projekt</h2>
              {projekteMitFinanzen.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Noch keine Angebote, Aufträge oder Rechnungen angelegt.</p>
              ) : (
                <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--ink-faint)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                      <th style={{ padding: '0 10px 10px 0', fontWeight: 700 }}>Projekt</th>
                      <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Angebote offen</th>
                      <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Auftragsvolumen (netto)</th>
                      <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Rechnungen gestellt</th>
                      <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Davon bezahlt</th>
                      <th style={{ padding: '0 0 10px 10px', fontWeight: 700 }}>Davon offen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projekteMitFinanzen.map((p) => {
                      const pAngebote = angebote.filter((a) => a.projekt_id === p.id && a.status === 'versendet')
                      const pAuftraege = auftraege.filter((a) => a.projekt_id === p.id && a.status === 'aktiv')
                      const pRechnungen = rechnungen.filter((r) => r.projekt_id === p.id && r.status !== 'storniert')
                      const pBezahlt = pRechnungen.filter((r) => r.status === 'bezahlt')
                      const pOffen = pRechnungen.filter((r) => r.status !== 'bezahlt')
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                          <td style={{ padding: '10px 10px 10px 0' }}>
                            <Link to={`/projekte/${p.id}`} style={{ textDecoration: 'none', color: 'var(--ink)', fontWeight: 600 }}>{p.name}</Link>{' '}
                            <span style={pillStil(projektStatusVariante[p.status] ?? 'neutral')}>{projektStatusLabel[p.status] ?? p.status}</span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <Link to={`/projekte/${p.id}?tab=angebote`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                              {euro.format(summeBrutto(pAngebote) / 100)}
                            </Link>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <Link to={`/projekte/${p.id}?tab=angebote`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                              {euro.format(summeNetto(pAuftraege) / 100)}
                            </Link>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <Link to={`/projekte/${p.id}?tab=rechnungen`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                              {euro.format(summeBrutto(pRechnungen) / 100)}
                            </Link>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <Link to={`/projekte/${p.id}?tab=rechnungen`} style={{ color: 'var(--olive)', textDecoration: 'none' }}>
                              {euro.format(summeBrutto(pBezahlt) / 100)}
                            </Link>
                          </td>
                          <td style={{ padding: '10px 0 10px 10px' }}>
                            <Link
                              to={`/projekte/${p.id}?tab=rechnungen`}
                              style={{ color: pOffen.length > 0 ? 'var(--orange-text)' : 'var(--ink-faint)', textDecoration: 'none' }}
                            >
                              {euro.format(summeBrutto(pOffen) / 100)}
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <p className="footnote">
              Alle Beträge brutto, direkt aus den Angeboten/Aufträgen/Rechnungen je Projekt errechnet (Auftragsvolumen
              ohne MwSt., da Aufträge selbst keinen Steuersatz führen). Eine echte Marge je Projekt und automatische
              Zahlungseingänge folgen mit der Bankanbindung – siehe Reiter „Buchhaltung".
            </p>
          </>
        )
      )}

      {aktivTab === 'buchhaltung' && <BuchhaltungTab />}
      {aktivTab === 'steuern' && <SteuernTab />}
    </AppShell>
  )
}

type DatevEinstellungen = {
  datev_berater_nr: string | null
  datev_mandanten_nr: string | null
  datev_kontenrahmen: 'SKR03' | 'SKR04' | null
  datev_erloeskonto: string | null
  datev_debitorenkonto: string | null
}

type RechnungFuerExport = {
  id: string
  rechnungsnummer: string
  summe_netto_cents: number
  mwst_satz: number
  status: Rechnung['status']
  faellig_am: string | null
  erstellt_am: string
  projekte: { name: string; kunde_rechnungsadresse: string | null } | null
}

// DATEV verlangt Umlaut-freie Textfelder nur in der Praxis zuverlässig, wenn
// die Datei nicht explizit in Windows-1252 kodiert wird (siehe Hinweis unten,
// wir exportieren als UTF-8) - deshalb transliterieren wir statt zu riskieren,
// dass ä/ö/ü/ß beim Import falsch ankommen.
function transliterieren(text: string): string {
  return text
    .split('ä').join('ae').split('ö').join('oe').split('ü').join('ue')
    .split('Ä').join('Ae').split('Ö').join('Oe').split('Ü').join('Ue')
    .split('ß').join('ss')
}

function heuteIsoDatum() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function ersterTagDesMonatsIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Reduziertes, aber an die offizielle DATEV-„Buchungsstapel"-Schnittstelle
// (Formatkategorie 21, Formatversion 7) angelehntes EXTF-Format mit den
// Kernspalten, die für einen Rechnungsausgangs-Stapel gebraucht werden.
// Wichtig: ohne eigenes Kontenmodell/Bankanbindung buchen wir bewusst
// vereinfacht auf ein Sammel-Debitorenkonto (Belegfeld 1 = Rechnungsnummer
// bleibt die eindeutige Zuordnung für die Kanzlei). Vor dem ersten
// produktiven Einsatz unbedingt mit der Steuerkanzlei/DATEV testen -
// siehe Konzept Abschnitt 17.
function datevCsvErzeugen(
  rechnungen: RechnungFuerExport[],
  einstellungen: DatevEinstellungen,
  firmenname: string,
  vonIso: string,
  bisIso: string
): string {
  const jetzt = new Date()
  const zeitstempel =
    `${jetzt.getFullYear()}${String(jetzt.getMonth() + 1).padStart(2, '0')}${String(jetzt.getDate()).padStart(2, '0')}` +
    `${String(jetzt.getHours()).padStart(2, '0')}${String(jetzt.getMinutes()).padStart(2, '0')}${String(jetzt.getSeconds()).padStart(2, '0')}000`
  const vonKompakt = vonIso.split('-').join('')
  const bisKompakt = bisIso.split('-').join('')
  const wjBeginn = `${vonIso.slice(0, 4)}0101`
  const bezeichnung = transliterieren(`Werkfluss-Export ${firmenname}`).slice(0, 30)
  const beraterNr = (einstellungen.datev_berater_nr ?? '').trim()
  const mandantenNr = (einstellungen.datev_mandanten_nr ?? '').trim()

  const kopfzeile =
    `"EXTF";700;21;"Buchungsstapel";7;${zeitstempel};;"RE";;;` +
    `${beraterNr};${mandantenNr};${wjBeginn};4;${vonKompakt};${bisKompakt};"${bezeichnung}";"";1;;0;"EUR"`

  const spaltenzeile =
    '"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz";"Kurs";"Basis-Umsatz";' +
    '"WKZ Basis-Umsatz";"Konto";"Gegenkonto (ohne BU-Schlüssel)";"BU-Schlüssel";"Belegdatum";' +
    '"Belegfeld 1";"Belegfeld 2";"Skonto";"Buchungstext"'

  const buchungszeilen = rechnungen.map((r) => {
    const bruttoCents = Math.round(r.summe_netto_cents * (1 + r.mwst_satz / 100))
    const umsatz = (bruttoCents / 100).toFixed(2).replace('.', ',')
    const bezugsdatum = (r.faellig_am ?? r.erstellt_am.slice(0, 10)).slice(0, 10)
    const [, monat, tag] = bezugsdatum.split('-')
    const belegdatum = `${tag}${monat}`
    const kundenName = (r.projekte?.kunde_rechnungsadresse?.split('\n')[0] || r.projekte?.name || 'Unbekannt').trim()
    const buchungstext = transliterieren(`Rechnung ${r.rechnungsnummer} - ${kundenName}`).slice(0, 60).split('"').join("'")
    const belegfeld1 = r.rechnungsnummer.slice(0, 36).split('"').join("'")
    const bu = r.mwst_satz === 19 ? '9' : r.mwst_satz === 7 ? '8' : ''

    return (
      `${umsatz};"S";"";;;"";${einstellungen.datev_debitorenkonto};${einstellungen.datev_erloeskonto};` +
      `${bu};${belegdatum};"${belegfeld1}";"";;"${buchungstext}"`
    )
  })

  return [kopfzeile, spaltenzeile, ...buchungszeilen].join('\r\n') + '\r\n'
}

function BuchhaltungTab() {
  const { aktivFirma } = useAuth()
  const [einstellungen, setEinstellungen] = useState<DatevEinstellungen | null>(null)
  const [ladeEinstellungen, setLadeEinstellungen] = useState(true)
  const [bearbeiteEinstellungen, setBearbeiteEinstellungen] = useState(false)
  const [beraterNr, setBeraterNr] = useState('')
  const [mandantenNr, setMandantenNr] = useState('')
  const [kontenrahmen, setKontenrahmen] = useState<'SKR03' | 'SKR04'>('SKR03')
  const [erloeskonto, setErloeskonto] = useState('8400')
  const [debitorenkonto, setDebitorenkonto] = useState('10000')
  const [speichertEinstellungen, setSpeichertEinstellungen] = useState(false)

  const [exportVon, setExportVon] = useState(ersterTagDesMonatsIso())
  const [exportBis, setExportBis] = useState(heuteIsoDatum())
  const [exportLaeuft, setExportLaeuft] = useState(false)
  const [exportFehler, setExportFehler] = useState<string | null>(null)
  const [exportHinweis, setExportHinweis] = useState<string | null>(null)

  useEffect(() => {
    if (!aktivFirma) return
    setLadeEinstellungen(true)
    supabase
      .from('firmen')
      .select('datev_berater_nr, datev_mandanten_nr, datev_kontenrahmen, datev_erloeskonto, datev_debitorenkonto')
      .eq('id', aktivFirma.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const d = data as DatevEinstellungen
          setEinstellungen(d)
          setBeraterNr(d.datev_berater_nr ?? '')
          setMandantenNr(d.datev_mandanten_nr ?? '')
          setKontenrahmen(d.datev_kontenrahmen ?? 'SKR03')
          setErloeskonto(d.datev_erloeskonto ?? '8400')
          setDebitorenkonto(d.datev_debitorenkonto ?? '10000')
        }
        setLadeEinstellungen(false)
      })
  }, [aktivFirma?.id])

  async function einstellungenSpeichern() {
    if (!aktivFirma) return
    setSpeichertEinstellungen(true)
    const neu: DatevEinstellungen = {
      datev_berater_nr: beraterNr.trim() || null,
      datev_mandanten_nr: mandantenNr.trim() || null,
      datev_kontenrahmen: kontenrahmen,
      datev_erloeskonto: erloeskonto.trim() || null,
      datev_debitorenkonto: debitorenkonto.trim() || null,
    }
    const { error } = await supabase.from('firmen').update(neu).eq('id', aktivFirma.id)
    setSpeichertEinstellungen(false)
    if (!error) {
      setEinstellungen(neu)
      setBearbeiteEinstellungen(false)
    }
  }

  async function datevExportErzeugen() {
    if (!aktivFirma) return
    if (!einstellungen?.datev_erloeskonto || !einstellungen?.datev_debitorenkonto) {
      setExportFehler('Bitte zuerst unten die DATEV-Einstellungen ausfüllen (mindestens Erlös- und Debitorenkonto).')
      return
    }
    setExportLaeuft(true)
    setExportFehler(null)
    setExportHinweis(null)
    const { data, error } = await supabase
      .from('rechnungen_ausgang')
      .select('id, rechnungsnummer, summe_netto_cents, mwst_satz, status, faellig_am, erstellt_am, projekte(name, kunde_rechnungsadresse)')
      .neq('status', 'storniert')
      .gte('erstellt_am', exportVon)
      .lte('erstellt_am', `${exportBis}T23:59:59`)
      .order('erstellt_am', { ascending: true })
    setExportLaeuft(false)
    if (error) {
      setExportFehler('Rechnungen konnten nicht geladen werden.')
      return
    }
    const rechnungen = (data ?? []) as unknown as RechnungFuerExport[]
    if (rechnungen.length === 0) {
      setExportFehler('Keine Rechnungen im gewählten Zeitraum gefunden.')
      return
    }
    const csv = datevCsvErzeugen(rechnungen, einstellungen, aktivFirma.name, exportVon, exportBis)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `EXTF_Buchungsstapel_${exportVon.split('-').join('')}_${exportBis.split('-').join('')}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setExportHinweis(`${rechnungen.length} Rechnung${rechnungen.length === 1 ? '' : 'en'} exportiert und heruntergeladen.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={karteStil}>
        <span style={pillStil('neutral')}>Phase 4</span>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '14px 0 10px' }}>Buchhaltung mit Bankanbindung &amp; DATEV</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-dim)', maxWidth: 640, lineHeight: 1.6 }}>
          Die Zahlen aus der Übersicht – Angebote, Aufträge und Rechnungen je Projekt – sind bereits die
          Grundlage für eine vollständige Buchhaltung. Der DATEV-Export unten ist ein erster, funktionsfähiger
          Baustein davon. Der automatische Zahlungsabgleich über eine Bankanbindung und ein Mahnwesen für
          überfällige Rechnungen fehlen noch – weil Zahlungsabwicklung eine eigene Regulierungsfrage ist,
          planen wir das in Kooperation mit einem lizenzierten Partner, statt es selbst nachzubauen.
        </p>
      </div>

      <div style={karteStil}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: 0 }}>DATEV-Export (Rechnungsausgang)</h2>
          <span style={pillStil('warn')}>Erster Entwurf</span>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.6, maxWidth: 640 }}>
          Exportiert alle Ausgangsrechnungen im gewählten Zeitraum als DATEV-„Buchungsstapel"-Datei (EXTF-Format)
          zum Import in die Kanzleisoftware. Ohne eigene Bankanbindung und Kontenmodell buchen wir bewusst
          vereinfacht auf ein einziges Sammel-Debitorenkonto – die Rechnungsnummer bleibt als Belegfeld 1 die
          eindeutige Zuordnung für die Kanzlei. <b>Bitte vor dem ersten produktiven Import einmal gemeinsam mit
          deiner Steuerkanzlei testen</b> – das DATEV-Format hat viele Detailregeln, die sich nur mit einem echten
          Testimport zuverlässig bestätigen lassen.
        </p>

        {ladeEinstellungen ? (
          <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Lädt …</p>
        ) : (
          <>
            {!bearbeiteEinstellungen ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', marginBottom: 16, fontSize: 12.5, color: 'var(--ink-dim)' }}>
                <span>Berater-Nr.: <b style={{ color: 'var(--ink)' }}>{einstellungen?.datev_berater_nr || '–'}</b></span>
                <span>Mandanten-Nr.: <b style={{ color: 'var(--ink)' }}>{einstellungen?.datev_mandanten_nr || '–'}</b></span>
                <span>Kontenrahmen: <b style={{ color: 'var(--ink)' }}>{einstellungen?.datev_kontenrahmen || '–'}</b></span>
                <span>Erlöskonto: <b style={{ color: 'var(--ink)' }}>{einstellungen?.datev_erloeskonto || '–'}</b></span>
                <span>Debitorenkonto: <b style={{ color: 'var(--ink)' }}>{einstellungen?.datev_debitorenkonto || '–'}</b></span>
                <button
                  onClick={() => setBearbeiteEinstellungen(true)}
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--olive)' }}
                >
                  Bearbeiten
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, padding: 14, borderRadius: 12, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,.35)' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                    Berater-Nr. (von der Kanzlei)
                    <input value={beraterNr} onChange={(e) => setBeraterNr(e.target.value)} placeholder="z. B. 123456" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                    Mandanten-Nr. (von der Kanzlei)
                    <input value={mandantenNr} onChange={(e) => setMandantenNr(e.target.value)} placeholder="z. B. 1001" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 140px' }}>
                    Kontenrahmen
                    <select
                      value={kontenrahmen}
                      onChange={(e) => {
                        const kr = e.target.value as 'SKR03' | 'SKR04'
                        setKontenrahmen(kr)
                        setErloeskonto(kr === 'SKR04' ? '4400' : '8400')
                      }}
                    >
                      <option value="SKR03">SKR03</option>
                      <option value="SKR04">SKR04</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                    Erlöskonto (19% USt)
                    <input value={erloeskonto} onChange={(e) => setErloeskonto(e.target.value)} placeholder="z. B. 8400" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                    Sammel-Debitorenkonto
                    <input value={debitorenkonto} onChange={(e) => setDebitorenkonto(e.target.value)} placeholder="z. B. 10000" />
                  </label>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                  Diese vier Angaben bekommst du von deiner Steuerkanzlei – sie sorgen dafür, dass die Kanzlei die
                  Datei überhaupt deinem Mandanten zuordnen kann.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={einstellungenSpeichern} disabled={speichertEinstellungen} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', border: 'none', background: 'var(--olive)', color: '#fff' }}>
                    {speichertEinstellungen ? 'Speichert …' : 'Speichern'}
                  </button>
                  <button onClick={() => setBearbeiteEinstellungen(false)} style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'transparent' }}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
                Zeitraum von
                <input type="date" value={exportVon} onChange={(e) => setExportVon(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
                bis
                <input type="date" value={exportBis} onChange={(e) => setExportBis(e.target.value)} />
              </label>
              <button
                onClick={datevExportErzeugen}
                disabled={exportLaeuft}
                style={{ fontSize: 12.5, fontWeight: 700, padding: '9px 16px', borderRadius: 999, cursor: 'pointer', border: 'none', background: 'var(--olive)', color: '#fff' }}
              >
                {exportLaeuft ? 'Erzeugt …' : '⬇ DATEV-Buchungsstapel exportieren'}
              </button>
            </div>
            {exportFehler && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--red)' }}>{exportFehler}</p>}
            {exportHinweis && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--olive)' }}>{exportHinweis}</p>}
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <BuchhaltungSchritt
          titel="Bankanbindung"
          text="Zahlungseingänge automatisch mit offenen Rechnungen abgleichen, statt sie manuell auf „bezahlt“ zu setzen."
        />
      </div>

      <p className="footnote">
        Mahnwesen ist da: Im Reiter „Übersicht“ lässt sich bei jeder überfälligen Rechnung direkt ein fertiger
        Mahntext (Zahlungserinnerung, 1. und 2. Mahnung) erzeugen und die Mahnstufe vermerken – der Versand selbst
        läuft weiterhin über dein eigenes E-Mail-Postfach, bis Werkfluss E-Mails automatisch verschicken kann. Bis
        die Bankanbindung steht, bleibt „bezahlt“ manuell zu setzen.
      </p>
    </div>
  )
}

function BuchhaltungSchritt({ titel, text }: { titel: string; text: string }) {
  return (
    <div style={{ ...karteStil, padding: '18px 20px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--olive-light)' }}>{titel}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.6 }}>{text}</div>
    </div>
  )
}

// Steuerabgaben-Uebersicht (Konzept Abschnitt 8.7/8.12): Faelligkeitskalender
// fuer wiederkehrende Steuertermine plus eine unverbindliche, regelbasierte
// Schaetzung der Umsatzsteuer auf bereits gestellte Ausgangsrechnungen -
// bisher komplett unumgesetzt, obwohl Mahnwesen und DATEV-Export aus
// demselben Abschnitt schon laengst gebaut sind.
const STEUERART_LABEL: Record<string, string> = {
  ust_voranmeldung: 'USt-Voranmeldung',
  gewerbesteuer_vorauszahlung: 'Gewerbesteuer-Vorauszahlung',
  einkommensteuer_vorauszahlung: 'Einkommensteuer-Vorauszahlung',
  sonstige: 'Sonstige',
}

type Steuervorgang = {
  id: string
  art: string
  zeitraum: string | null
  faellig_am: string
  status: 'offen' | 'erledigt'
  geschaetzter_betrag_cents: number | null
  notiz: string | null
}

function SteuernTab() {
  const { aktivFirma, session } = useAuth()
  const [vorgaenge, setVorgaenge] = useState<Steuervorgang[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [zeigeErledigte, setZeigeErledigte] = useState(false)

  const [art, setArt] = useState('ust_voranmeldung')
  const [zeitraum, setZeitraum] = useState('')
  const [faelligAm, setFaelligAm] = useState('')
  const [betrag, setBetrag] = useState('')
  const [notiz, setNotiz] = useState('')
  const [speichert, setSpeichert] = useState(false)

  const [schaetzungVon, setSchaetzungVon] = useState(ersterTagDesMonatsIso())
  const [schaetzungBis, setSchaetzungBis] = useState(heuteIsoDatum())
  const [schaetzungLaeuft, setSchaetzungLaeuft] = useState(false)
  const [schaetzungFehler, setSchaetzungFehler] = useState<string | null>(null)
  const [schaetzung, setSchaetzung] = useState<{ nettoCents: number; ustCents: number; anzahl: number } | null>(null)

  async function laden() {
    if (!aktivFirma) return
    setLadeStatus('laedt')
    const { data } = await supabase
      .from('steuervorgaenge')
      .select('id, art, zeitraum, faellig_am, status, geschaetzter_betrag_cents, notiz')
      .eq('firma_id', aktivFirma.id)
      .order('faellig_am', { ascending: true })
    setVorgaenge((data ?? []) as Steuervorgang[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [aktivFirma?.id])

  async function anlegen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!aktivFirma || !faelligAm) return
    setSpeichert(true)
    const betragCents = betrag.trim() ? Math.round(parseFloat(betrag.replace(',', '.')) * 100) : null
    const { error } = await supabase.from('steuervorgaenge').insert({
      firma_id: aktivFirma.id,
      art,
      zeitraum: zeitraum.trim() || null,
      faellig_am: faelligAm,
      geschaetzter_betrag_cents: Number.isFinite(betragCents) ? betragCents : null,
      notiz: notiz.trim() || null,
      erstellt_von: session?.user?.id ?? null,
    })
    setSpeichert(false)
    if (!error) {
      setZeitraum(''); setFaelligAm(''); setBetrag(''); setNotiz('')
      setZeigeFormular(false)
      laden()
    }
  }

  async function statusUmschalten(v: Steuervorgang) {
    const neu = v.status === 'erledigt' ? 'offen' : 'erledigt'
    setVorgaenge((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: neu } : x)))
    await supabase.from('steuervorgaenge').update({ status: neu }).eq('id', v.id)
  }

  async function loeschen(v: Steuervorgang) {
    if (!confirm('Diesen Steuertermin wirklich löschen?')) return
    setVorgaenge((prev) => prev.filter((x) => x.id !== v.id))
    await supabase.from('steuervorgaenge').delete().eq('id', v.id)
  }

  async function schaetzungBerechnen() {
    if (!aktivFirma) return
    setSchaetzungLaeuft(true)
    setSchaetzungFehler(null)
    setSchaetzung(null)
    const { data, error } = await supabase
      .from('rechnungen_ausgang')
      .select('summe_netto_cents, mwst_satz, status, erstellt_am, projekte!inner(firma_id)')
      .eq('projekte.firma_id', aktivFirma.id)
      .neq('status', 'storniert')
      .gte('erstellt_am', schaetzungVon)
      .lte('erstellt_am', `${schaetzungBis}T23:59:59`)
    setSchaetzungLaeuft(false)
    if (error) { setSchaetzungFehler('Rechnungen konnten nicht geladen werden.'); return }
    const zeilen = (data ?? []) as unknown as { summe_netto_cents: number; mwst_satz: number }[]
    if (zeilen.length === 0) { setSchaetzungFehler('Keine Rechnungen im gewählten Zeitraum gefunden.'); return }
    const nettoCents = zeilen.reduce((sum, z) => sum + z.summe_netto_cents, 0)
    const ustCents = zeilen.reduce((sum, z) => sum + Math.round((z.summe_netto_cents * z.mwst_satz) / 100), 0)
    setSchaetzung({ nettoCents, ustCents, anzahl: zeilen.length })
  }

  const heuteIso = heuteIsoDatum()
  const offeneVorgaenge = vorgaenge.filter((v) => v.status === 'offen')
  const erledigteVorgaenge = vorgaenge.filter((v) => v.status === 'erledigt')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={karteStil}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 10px' }}>Steuerabgaben-Übersicht</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-dim)', maxWidth: 640, lineHeight: 1.6 }}>
          Ein Fälligkeitskalender für wiederkehrende Steuertermine (USt-Voranmeldung, Gewerbesteuer-
          Vorauszahlung, Einkommensteuer-Vorauszahlung) plus eine grobe Schätzung der Umsatzsteuer auf bereits
          gestellte Ausgangsrechnungen. <b>Keine Steuerberatung, keine echte Voranmeldung, keine ELSTER-
          Anbindung</b> – nur damit Fristen nicht in der Alltagshektik untergehen.
        </p>
      </div>

      <div style={karteStil}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: 0 }}>Fälligkeitskalender</h2>
          <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
            {zeigeFormular ? 'Abbrechen' : '+ Steuertermin'}
          </button>
        </div>

        {zeigeFormular && (
          <form onSubmit={anlegen} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18, padding: 14, borderRadius: 12, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,.35)' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 220px' }}>
                Art
                <select style={eingabeStil} value={art} onChange={(e) => setArt(e.target.value)}>
                  {Object.entries(STEUERART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                Zeitraum (optional)
                <input style={eingabeStil} value={zeitraum} onChange={(e) => setZeitraum(e.target.value)} placeholder="z. B. Q3 2026" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                Fällig am
                <input type="date" style={eingabeStil} value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} required />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                Geschätzter Betrag in € (optional)
                <input style={eingabeStil} value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="z. B. 2400" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', flex: '2 1 220px' }}>
                Notiz (optional)
                <input style={eingabeStil} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Steuerberater XY informiert" />
              </label>
            </div>
            <button type="submit" style={knopfStil} disabled={speichert || !faelligAm}>
              {speichert ? 'Speichert …' : 'Steuertermin speichern'}
            </button>
          </form>
        )}

        {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Lädt …</p>}
        {ladeStatus === 'bereit' && offeneVorgaenge.length === 0 && (
          <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Keine offenen Steuertermine.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {offeneVorgaenge.map((v) => {
            const ueberfaellig = v.faellig_am < heuteIso
            return (
              <div key={v.id} style={{ ...karteStil, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 220 }}>
                  <input type="checkbox" checked={false} onChange={() => statusUmschalten(v)} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {STEUERART_LABEL[v.art] ?? v.art}{v.zeitraum ? ` · ${v.zeitraum}` : ''}
                  </span>
                </label>
                {v.geschaetzter_betrag_cents != null && (
                  <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>~ {(v.geschaetzter_betrag_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
                )}
                <span style={pillStil(ueberfaellig ? 'bad' : 'neutral')}>{new Date(v.faellig_am).toLocaleDateString('de-DE')}</span>
                <button onClick={() => loeschen(v)} title="Entfernen" style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--ink-faint)', padding: '0 4px' }}>×</button>
              </div>
            )
          })}
        </div>

        {erledigteVorgaenge.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setZeigeErledigte((v) => !v)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--olive)' }}>
              {zeigeErledigte ? 'Erledigte ausblenden' : `${erledigteVorgaenge.length} erledigte anzeigen`}
            </button>
            {zeigeErledigte && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {erledigteVorgaenge.map((v) => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, color: 'var(--ink-faint)' }}>
                    <input type="checkbox" checked={true} onChange={() => statusUmschalten(v)} />
                    <span style={{ textDecoration: 'line-through' }}>{STEUERART_LABEL[v.art] ?? v.art}{v.zeitraum ? ` · ${v.zeitraum}` : ''}</span>
                    <span>{new Date(v.faellig_am).toLocaleDateString('de-DE')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={karteStil}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: 0 }}>Umsatzsteuer-Schätzung</h2>
          <span style={pillStil('warn')}>Unverbindlich</span>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.6, maxWidth: 640 }}>
          Summiert die Umsatzsteuer auf alle Ausgangsrechnungen im gewählten Zeitraum. Werkfluss erfasst bisher
          keine Eingangsrechnungen/Vorsteuer – das ist also <b>nicht deine tatsächliche Zahllast</b>, sondern nur
          die Umsatzsteuer auf das, was du in Rechnung gestellt hast, als grober Anhaltspunkt für die
          Voranmeldung.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
            Zeitraum von
            <input type="date" style={eingabeStil} value={schaetzungVon} onChange={(e) => setSchaetzungVon(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
            bis
            <input type="date" style={eingabeStil} value={schaetzungBis} onChange={(e) => setSchaetzungBis(e.target.value)} />
          </label>
          <button style={knopfSekundaerStil} onClick={schaetzungBerechnen} disabled={schaetzungLaeuft}>
            {schaetzungLaeuft ? 'Berechnet …' : 'Schätzung berechnen'}
          </button>
        </div>
        {schaetzungFehler && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--red)' }}>{schaetzungFehler}</p>}
        {schaetzung && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Netto-Umsatz</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 20, fontWeight: 700 }}>{(schaetzung.nettoCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Geschätzte USt. (ohne Vorsteuer)</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 20, fontWeight: 700, color: 'var(--olive-light)' }}>{(schaetzung.ustCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Rechnungen</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 20, fontWeight: 700 }}>{schaetzung.anzahl}</div>
            </div>
          </div>
        )}
      </div>

      <p className="footnote">
        Fälligkeitskalender und Schätzung sind rein regelbasiert (keine KI) und ersetzen keine Steuerberatung.
        Eine echte Umsatzsteuervoranmeldung, eine ELSTER-Anbindung und die Berücksichtigung von Vorsteuer aus
        Eingangsrechnungen sind bewusst nicht Teil dieser Umsetzung.
      </p>
    </div>
  )
}
