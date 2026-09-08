import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, pillStil, projektStatusLabel, projektStatusVariante } from './stil'

type ProjektZeile = { id: string; name: string; status: string }

type Angebot = {
  id: string
  projekt_id: string
  gewerk: string | null
  summe_netto_cents: number
  mwst_satz: number
  status: 'entwurf' | 'versendet' | 'angenommen' | 'abgelehnt'
  gueltig_bis: string | null
}

type Auftrag = {
  id: string
  projekt_id: string
  summe_netto_cents: number
  status: 'aktiv' | 'abgeschlossen' | 'storniert'
}

type Rechnung = {
  id: string
  projekt_id: string
  rechnungsnummer: string
  typ: 'abschlag' | 'schluss' | 'sonstige'
  summe_netto_cents: number
  mwst_satz: number
  status: 'offen' | 'bezahlt' | 'ueberfaellig' | 'storniert'
  faellig_am: string | null
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
function brutto(cents: number, satz: number) {
  return Math.round(cents * (1 + satz / 100))
}
function summeBrutto(zeilen: { summe_netto_cents: number; mwst_satz: number }[]) {
  return zeilen.reduce((summe, z) => summe + brutto(z.summe_netto_cents, z.mwst_satz), 0)
}
function summeNetto(zeilen: { summe_netto_cents: number }[]) {
  return zeilen.reduce((summe, z) => summe + z.summe_netto_cents, 0)
}
function formatKurz(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function Finanzen() {
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<ProjektZeile[]>([])
  const [angebote, setAngebote] = useState<Angebot[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: pData }, { data: anData }, { data: auData }, { data: rData }] = await Promise.all([
      supabase.from('projekte').select('id, name, status'),
      supabase.from('angebote').select('id, projekt_id, gewerk, summe_netto_cents, mwst_satz, status, gueltig_bis'),
      supabase.from('auftraege').select('id, projekt_id, summe_netto_cents, status'),
      supabase
        .from('rechnungen_ausgang')
        .select('id, projekt_id, rechnungsnummer, typ, summe_netto_cents, mwst_satz, status, faellig_am')
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
  const istUeberfaellig = (r: Rechnung) => r.status === 'ueberfaellig' || (r.status === 'offen' && !!r.faellig_am && r.faellig_am < heuteIso)

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

  return (
    <AppShell title="Finanzen" subtitle={aktivFirma?.name} wide>
      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            <Stat label="Offene Forderungen" value={euro.format(offeneForderungenCents / 100)} />
            <Stat label="Davon überfällig" value={euro.format(ueberfaelligeSummeCents / 100)} warnend={ueberfaelligeSummeCents > 0} />
            <Stat label="Aktive Auftragssumme (netto)" value={euro.format(aktiveAuftragsSummeCents / 100)} />
            <Stat label="Angebote in Prüfung" value={euro.format(angeboteVersendetSummeCents / 100)} />
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
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 13,
                          background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)',
                        }}
                      >
                        <Link to={`/projekte/${r.projekt_id}?tab=rechnungen`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--ink)' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.rechnungsnummer} · {euro.format(brutto(r.summe_netto_cents, r.mwst_satz) / 100)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {projektName(r.projekt_id)}
                          </div>
                        </Link>
                        {r.faellig_am && <span style={pillStil(ueberf ? 'bad' : 'neutral')}>{formatKurz(r.faellig_am)}</span>}
                        <button
                          onClick={() => alsBezahltMarkieren(r.id)}
                          title="Als bezahlt markieren"
                          style={{
                            fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                            border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--olive)', whiteSpace: 'nowrap',
                          }}
                        >
                          Bezahlt ✓
                        </button>
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
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)',
                        border: '1px solid var(--glass-border)', textDecoration: 'none', color: 'var(--ink)',
                      }}
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
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
                Noch keine Angebote, Aufträge oder Rechnungen angelegt.
              </p>
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
                        <td style={{ padding: '10px' }}>{euro.format(summeBrutto(pAngebote) / 100)}</td>
                        <td style={{ padding: '10px' }}>{euro.format(summeNetto(pAuftraege) / 100)}</td>
                        <td style={{ padding: '10px' }}>{euro.format(summeBrutto(pRechnungen) / 100)}</td>
                        <td style={{ padding: '10px', color: 'var(--olive)' }}>{euro.format(summeBrutto(pBezahlt) / 100)}</td>
                        <td style={{ padding: '10px 0 10px 10px', color: pOffen.length > 0 ? 'var(--orange-text)' : 'var(--ink-faint)' }}>
                          {euro.format(summeBrutto(pOffen) / 100)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="footnote">
            Alle Beträge brutto, direkt aus den Angeboten/Aufträgen/Rechnungen je Projekt errechnet. Eine echte
            Marge je Projekt (Erlöse minus tatsächliche Kosten), Zahlungseingänge per Bankanbindung und
            DATEV-Export folgen mit der eigentlichen Buchhaltungsanbindung.
          </p>
        </>
      )}
    </AppShell>
  )
}

function Stat({ label, value, warnend }: { label: string; value: string; warnend?: boolean }) {
  return (
    <div className="stat liquid" style={{ padding: '18px 20px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-display)', marginTop: 4, color: warnend ? 'var(--red)' : 'inherit' }}>{value}</div>
    </div>
  )
}
