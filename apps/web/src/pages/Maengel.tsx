import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, pillStil, projektStatusLabel, projektStatusVariante } from './stil'

type ProjektZeile = { id: string; name: string; status: string }
type Mangel = {
  id: string
  titel: string
  dringlichkeit: 'kritisch' | 'mittel' | 'gering'
  status: 'offen' | 'in_bearbeitung' | 'behoben' | 'abgenommen'
  zustaendiges_gewerk: string | null
  frist: string | null
  projekt_id: string
}

const statusLabel: Record<Mangel['status'], string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  behoben: 'Behoben',
  abgenommen: 'Abgenommen',
}
const dringlichkeitFarbe: Record<Mangel['dringlichkeit'], string> = {
  kritisch: 'var(--red)',
  mittel: 'var(--orange-text)',
  gering: 'var(--ink-faint)',
}
const dringlichkeitRang: Record<Mangel['dringlichkeit'], number> = { kritisch: 0, mittel: 1, gering: 2 }

function formatKurz(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function WarnIcon({ groesse = 38 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  )
}

export default function Maengel() {
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<ProjektZeile[]>([])
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: pData }, { data: mData }] = await Promise.all([
      supabase.from('projekte').select('id, name, status'),
      supabase
        .from('maengel')
        .select('id, titel, dringlichkeit, status, zustaendiges_gewerk, frist, projekt_id')
        .order('erstellt_am', { ascending: false }),
    ])
    setProjekte((pData ?? []) as ProjektZeile[])
    setMaengel((mData ?? []) as Mangel[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [])

  async function statusAendern(id: string, status: Mangel['status']) {
    setMaengel((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)))
    await supabase.from('maengel').update({ status }).eq('id', id)
  }

  const heuteIso = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const projektName = (id: string) => projekte.find((p) => p.id === id)?.name ?? 'Unbekanntes Projekt'
  const istOffen = (m: Mangel) => m.status === 'offen' || m.status === 'in_bearbeitung'
  const istUeberfaellig = (m: Mangel) => istOffen(m) && !!m.frist && m.frist < heuteIso

  const offeneMaengel = maengel.filter(istOffen)
  const kritischeMaengel = offeneMaengel.filter((m) => m.dringlichkeit === 'kritisch')
  const ueberfaelligeMaengel = maengel.filter(istUeberfaellig)
  const abgeschlossen = maengel.filter((m) => m.status === 'behoben' || m.status === 'abgenommen')
  const abnahmeQuote = maengel.length > 0 ? Math.round((abgeschlossen.length / maengel.length) * 100) : null

  const dringendeMaengel = [...offeneMaengel]
    .sort((a, b) => {
      const ua = istUeberfaellig(a), ub = istUeberfaellig(b)
      if (dringlichkeitRang[a.dringlichkeit] !== dringlichkeitRang[b.dringlichkeit]) {
        return dringlichkeitRang[a.dringlichkeit] - dringlichkeitRang[b.dringlichkeit]
      }
      if (ua !== ub) return ua ? -1 : 1
      return (a.frist ?? '9999') < (b.frist ?? '9999') ? -1 : 1
    })
    .slice(0, 8)

  const gewerkRanking = useMemo(() => {
    const zaehler = new Map<string, number>()
    for (const m of offeneMaengel) {
      const name = m.zustaendiges_gewerk?.trim() || 'Ohne Gewerk'
      zaehler.set(name, (zaehler.get(name) ?? 0) + 1)
    }
    return [...zaehler.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [offeneMaengel])

  const projekteMitMaengeln = projekte.filter((p) => maengel.some((m) => m.projekt_id === p.id))

  const heroText = useMemo(() => {
    if (kritischeMaengel.length > 0) {
      const n = kritischeMaengel.length
      return {
        titel: n === 1 ? '1 kritischer Mangel offen.' : `${n} kritische Mängel offen.`,
        subtitel: `${offeneMaengel.length} Mängel insgesamt offen, ${ueberfaelligeMaengel.length} davon über der Frist.`,
      }
    }
    if (ueberfaelligeMaengel.length > 0) {
      const n = ueberfaelligeMaengel.length
      return {
        titel: n === 1 ? '1 Mangel über der Frist.' : `${n} Mängel über der Frist.`,
        subtitel: `Sonst nichts Kritisches – ${offeneMaengel.length} Mängel insgesamt offen.`,
      }
    }
    if (offeneMaengel.length > 0) {
      const n = offeneMaengel.length
      return {
        titel: n === 1 ? '1 offener Mangel, nichts Kritisches.' : `${n} offene Mängel, nichts Kritisches.`,
        subtitel: 'Keine Fristen überschritten – guter Stand.',
      }
    }
    return {
      titel: 'Keine offenen Mängel.',
      subtitel: maengel.length > 0 ? 'Alle gemeldeten Mängel sind behoben oder abgenommen.' : 'Noch keine Mängel gemeldet.',
    }
  }, [kritischeMaengel.length, ueberfaelligeMaengel.length, offeneMaengel.length, maengel.length])

  return (
    <AppShell title="Mängel & Abnahme" subtitle={aktivFirma?.name} wide>
      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 14 }}>
              <a href="#dringende-maengel" className="block olive-deep" style={{ gridColumn: 'span 7', minWidth: 260, textDecoration: 'none' }}>
                <div className="block-ticks" />
                <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <WarnIcon groesse={14} />
                  Qualität &amp; Abnahme
                </div>
                <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{offeneMaengel.length}</div>
                <div className="block-sub">{heroText.titel}</div>
              </a>
              <a href="#dringende-maengel" className={`block ${kritischeMaengel.length > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 5', minWidth: 220, textDecoration: 'none' }}>
                <div className="block-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {kritischeMaengel.length > 0 && <WarnIcon groesse={14} />}
                  {kritischeMaengel.length > 0 ? 'Kritische Mängel' : 'Kritisch'}
                </div>
                <div className="block-num" style={{ fontSize: 'clamp(30px, 3.2vw, 48px)' }}>{kritischeMaengel.length}</div>
                <div className="block-sub">{heroText.subtitel}</div>
              </a>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 24 }}>
              <a href="#dringende-maengel" className="block mustard" style={{ gridColumn: 'span 3', minWidth: 160, textDecoration: 'none' }}>
                <div className="block-lbl">Über der Frist</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(ueberfaelligeMaengel.length)}</div>
              </a>
              <a href="#maengel-je-projekt" className="block olive" style={{ gridColumn: 'span 3', minWidth: 160, textDecoration: 'none' }}>
                <div className="block-lbl">Abnahme-Quote</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{abnahmeQuote === null ? '–' : `${abnahmeQuote}%`}</div>
              </a>
              <a href="#maengel-je-projekt" className="block cream" style={{ gridColumn: 'span 3', minWidth: 160, textDecoration: 'none' }}>
                <div className="block-lbl">Projekte mit Mängeln</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(projekteMitMaengeln.length)}</div>
              </a>
              <a href="#maengel-je-projekt" className="block dark" style={{ gridColumn: 'span 3', minWidth: 160, textDecoration: 'none' }}>
                <div className="block-lbl">Mängel gesamt</div>
                <div className="block-num" style={{ fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{String(maengel.length)}</div>
              </a>
            </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 20, marginBottom: 24 }}>
            <div id="dringende-maengel" style={{ ...karteStil, scrollMarginTop: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Dringende Mängel</h2>
              {dringendeMaengel.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Keine offenen Mängel – gute Lage.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dringendeMaengel.map((m) => {
                    const ueberf = istUeberfaellig(m)
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 13, background: 'rgba(255,255,255,.4)', border: '1px solid var(--glass-border)' }}>
                        <Link to={`/projekte/${m.projekt_id}?tab=maengel`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--ink)' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.titel}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {projektName(m.projekt_id)}{m.zustaendiges_gewerk ? ` · ${m.zustaendiges_gewerk}` : ''}
                          </div>
                        </Link>
                        {m.frist && <span style={pillStil(ueberf ? 'bad' : 'neutral')}>{formatKurz(m.frist)}</span>}
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: dringlichkeitFarbe[m.dringlichkeit], whiteSpace: 'nowrap' }}>
                          {m.dringlichkeit.toUpperCase()}
                        </span>
                        <select
                          value={m.status}
                          onChange={(e) => statusAendern(m.id, e.target.value as Mangel['status'])}
                          style={{ fontSize: 11, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--ink)' }}
                        >
                          {Object.entries(statusLabel).map(([wert, label]) => (
                            <option key={wert} value={wert}>{label}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={karteStil}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Offene Mängel je Gewerk</h2>
              {gewerkRanking.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Keine offenen Mängel.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gewerkRanking.map(([name, anzahl]) => {
                    const breite = Math.round((anzahl / gewerkRanking[0][1]) * 100)
                    return (
                      <div key={name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>{name}</span>
                          <span style={{ color: 'var(--ink-faint)' }}>{anzahl}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: 'rgba(40,28,14,.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${breite}%`, borderRadius: 999, background: 'var(--orange-deep)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div id="maengel-je-projekt" style={{ ...karteStil, overflowX: 'auto', scrollMarginTop: 20 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 14px' }}>Mängel je Projekt</h2>
            {projekteMitMaengeln.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>Noch keine Mängel gemeldet.</p>
            ) : (
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-faint)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                    <th style={{ padding: '0 10px 10px 0', fontWeight: 700 }}>Projekt</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Offen</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Kritisch</th>
                    <th style={{ padding: '0 10px 10px', fontWeight: 700 }}>Behoben</th>
                    <th style={{ padding: '0 0 10px 10px', fontWeight: 700 }}>Abgenommen</th>
                  </tr>
                </thead>
                <tbody>
                  {projekteMitMaengeln.map((p) => {
                    const pMaengel = maengel.filter((m) => m.projekt_id === p.id)
                    const pOffen = pMaengel.filter(istOffen)
                    const pKritisch = pOffen.filter((m) => m.dringlichkeit === 'kritisch')
                    const pBehoben = pMaengel.filter((m) => m.status === 'behoben')
                    const pAbgenommen = pMaengel.filter((m) => m.status === 'abgenommen')
                    return (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '10px 10px 10px 0' }}>
                          <Link to={`/projekte/${p.id}?tab=maengel`} style={{ textDecoration: 'none', color: 'var(--ink)', fontWeight: 600 }}>{p.name}</Link>{' '}
                          <span style={pillStil(projektStatusVariante[p.status] ?? 'neutral')}>{projektStatusLabel[p.status] ?? p.status}</span>
                        </td>
                        <td style={{ padding: 0 }}><Link to={`/projekte/${p.id}?tab=maengel`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pOffen.length}</Link></td>
                        <td style={{ padding: 0, color: pKritisch.length > 0 ? 'var(--red)' : 'var(--ink-faint)', fontWeight: pKritisch.length > 0 ? 700 : 400 }}>
                          <Link to={`/projekte/${p.id}?tab=maengel`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pKritisch.length}</Link>
                        </td>
                        <td style={{ padding: 0 }}><Link to={`/projekte/${p.id}?tab=maengel`} style={{ display: 'block', padding: '10px', color: 'inherit', textDecoration: 'none' }}>{pBehoben.length}</Link></td>
                        <td style={{ padding: 0, color: 'var(--olive)' }}><Link to={`/projekte/${p.id}?tab=maengel`} style={{ display: 'block', padding: '10px 0 10px 10px', color: 'inherit', textDecoration: 'none' }}>{pAbgenommen.length}</Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="footnote">
            Zustand und Fristen kommen direkt aus dem Reiter „Mängel" je Projekt. Verortung auf dem Grundriss, Fotos je
            Mangel und ein digitales Abnahmeprotokoll mit Unterschrift sind als nächste Ausbaustufe vorgesehen.
          </p>
        </>
      )}
    </AppShell>
  )
}
