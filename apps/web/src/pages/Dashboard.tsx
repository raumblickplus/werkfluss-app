import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, pillStil } from './stil'

type Projekt = { id: string; name: string; status: string }
type Aufgabe = { id: string; titel: string; gewerk: string | null; faellig_am: string | null; status: string; projekt_id: string }
type Mangel = { id: string; titel: string; dringlichkeit: 'kritisch' | 'mittel' | 'gering'; status: string; frist: string | null; projekt_id: string }
type Rechnung = { id: string; rechnungsnummer: string; summe_netto_cents: number; status: string; faellig_am: string | null; projekt_id: string }

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const heute = new Date(); heute.setHours(0, 0, 0, 0)

function istUeberfaellig(datum: string | null) {
  if (!datum) return false
  return new Date(datum) < heute
}

const dringlichkeitVariante: Record<Mangel['dringlichkeit'], 'ok' | 'warn' | 'bad' | 'neutral'> = {
  kritisch: 'bad',
  mittel: 'warn',
  gering: 'neutral',
}
const dringlichkeitLabel: Record<Mangel['dringlichkeit'], string> = {
  kritisch: 'Kritisch',
  mittel: 'Mittel',
  gering: 'Gering',
}

export default function Dashboard() {
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  useEffect(() => {
    async function laden() {
      setLadeStatus('laedt')
      const [{ data: pData }, { data: aData }, { data: mData }, { data: rData }] = await Promise.all([
        supabase.from('projekte').select('id, name, status'),
        supabase
          .from('aufgaben')
          .select('id, titel, gewerk, faellig_am, status, projekt_id')
          .neq('status', 'erledigt')
          .order('faellig_am', { ascending: true, nullsFirst: false }),
        supabase
          .from('maengel')
          .select('id, titel, dringlichkeit, status, frist, projekt_id')
          .in('status', ['offen', 'in_bearbeitung'])
          .order('dringlichkeit', { ascending: true }),
        supabase
          .from('rechnungen_ausgang')
          .select('id, rechnungsnummer, summe_netto_cents, status, faellig_am, projekt_id')
          .in('status', ['offen', 'ueberfaellig']),
      ])
      setProjekte((pData ?? []) as Projekt[])
      setAufgaben((aData ?? []) as Aufgabe[])
      setMaengel((mData ?? []) as Mangel[])
      setRechnungen((rData ?? []) as Rechnung[])
      setLadeStatus('bereit')
    }
    laden()
  }, [])

  const projektName = (id: string) => projekte.find((p) => p.id === id)?.name ?? 'Unbekanntes Projekt'

  const aktiveProjekte = projekte.filter((p) => p.status === 'ausfuehrung' || p.status === 'abnahme').length
  const kritischeMaengel = maengel.filter((m) => m.dringlichkeit === 'kritisch').length
  const ueberfaelligeAufgaben = aufgaben.filter((a) => istUeberfaellig(a.faellig_am)).length
  const rechnungenSummeCents = rechnungen.reduce((sum, r) => sum + r.summe_netto_cents, 0)

  const dringendeMaengel = [...maengel]
    .sort((a, b) => {
      const rang = { kritisch: 0, mittel: 1, gering: 2 }
      return rang[a.dringlichkeit] - rang[b.dringlichkeit]
    })
    .slice(0, 6)

  const naechsteAufgaben = aufgaben.slice(0, 6)

  return (
    <AppShell title="Dashboard" subtitle={aktivFirma?.name}>
      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}

      {ladeStatus === 'bereit' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 26 }}>
            <div className="stat liquid">
              <div className="num">{projekte.length}</div>
              <div className="lbl">Projekte gesamt · {aktiveProjekte} in Ausführung/Abnahme</div>
            </div>
            <div className="stat liquid">
              <div className="num" style={{ color: kritischeMaengel > 0 ? 'var(--red)' : undefined }}>{maengel.length}</div>
              <div className="lbl">Offene Mängel · {kritischeMaengel} kritisch</div>
            </div>
            <div className="stat liquid">
              <div className="num" style={{ color: ueberfaelligeAufgaben > 0 ? 'var(--red)' : undefined }}>{aufgaben.length}</div>
              <div className="lbl">Offene Aufgaben · {ueberfaelligeAufgaben} überfällig</div>
            </div>
            <div className="stat liquid">
              <div className="num">{euro.format(rechnungenSummeCents / 100)}</div>
              <div className="lbl">Offene Rechnungen (netto, {rechnungen.length})</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            <div>
              <h3 style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 8px', fontWeight: 700 }}>
                Dringende Mängel
              </h3>
              <div style={{ ...karteStil, padding: '6px 8px' }}>
                {dringendeMaengel.length === 0 && (
                  <p style={{ padding: 12, color: 'var(--ink-faint)', fontSize: 13 }}>Keine offenen Mängel – gute Lage.</p>
                )}
                {dringendeMaengel.map((m) => (
                  <Link
                    key={m.id}
                    to={`/projekte/${m.projekt_id}?tab=maengel`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 10px', borderBottom: '1px solid rgba(40,28,14,.08)', textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.titel}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                        {projektName(m.projekt_id)}{m.frist ? ` · Frist ${new Date(m.frist).toLocaleDateString('de-DE')}` : ''}
                      </div>
                    </div>
                    <span style={pillStil(dringlichkeitVariante[m.dringlichkeit])}>{dringlichkeitLabel[m.dringlichkeit]}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 8px', fontWeight: 700 }}>
                Nächste Aufgaben
              </h3>
              <div style={{ ...karteStil, padding: '6px 8px' }}>
                {naechsteAufgaben.length === 0 && (
                  <p style={{ padding: 12, color: 'var(--ink-faint)', fontSize: 13 }}>Keine offenen Aufgaben.</p>
                )}
                {naechsteAufgaben.map((a) => {
                  const ueberfaellig = istUeberfaellig(a.faellig_am)
                  return (
                    <Link
                      key={a.id}
                      to={`/projekte/${a.projekt_id}?tab=aufgaben`}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 10px', borderBottom: '1px solid rgba(40,28,14,.08)', textDecoration: 'none', color: 'inherit' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titel}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                          {projektName(a.projekt_id)}{a.gewerk ? ` · ${a.gewerk}` : ''}
                        </div>
                      </div>
                      {a.faellig_am && (
                        <span style={pillStil(ueberfaellig ? 'bad' : 'neutral')}>
                          {ueberfaellig ? 'Überfällig' : new Date(a.faellig_am).toLocaleDateString('de-DE')}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          <p className="footnote">
            Termin- und Kostenübersicht je Projekt (z.B. Budget-Fortschritt, Zeitstrahl) folgen, sobald
            Zeitplan und Finanzen als eigene Module angebunden sind.
          </p>
        </>
      )}
    </AppShell>
  )
}
