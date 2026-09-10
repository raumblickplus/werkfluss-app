import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, eingabeStil, knopfStil, knopfSekundaerStil, pillStil } from './stil'

type Mitglied = {
  id: string
  nutzer_id: string
  rolle: string
  abteilung: string | null
  freigabe_limit_cents: number | null
  profile: { vollname: string; email: string } | null
}

type Einladung = {
  id: string
  rolle: string
  abteilung: string | null
  status: string
  token: string
  erstellt_am: string
}

const rolleLabel: Record<string, string> = {
  inhaber: 'Inhaber',
  geschaeftsfuehrung: 'Geschäftsführung',
  bauleitung: 'Bauleitung',
  finanzen: 'Finanzen',
  einkauf: 'Einkauf',
  mitarbeiter: 'Mitarbeiter',
}

function centsZuEuroEingabe(cents: number | null) {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')
}

export default function Team() {
  const { aktivFirma } = useAuth()
  const [mitglieder, setMitglieder] = useState<Mitglied[]>([])
  const [einladungen, setEinladungen] = useState<Einladung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [formOffen, setFormOffen] = useState(false)
  const [neueRolle, setNeueRolle] = useState('mitarbeiter')
  const [neueAbteilung, setNeueAbteilung] = useState('')
  const [wirdErstellt, setWirdErstellt] = useState(false)
  const [neuerLink, setNeuerLink] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [kopiertToken, setKopiertToken] = useState<string | null>(null)
  const [limitBearbeitung, setLimitBearbeitung] = useState<{ id: string; wert: string } | null>(null)
  const [limitSpeichert, setLimitSpeichert] = useState(false)

  const istAdmin = aktivFirma?.rolle === 'inhaber' || aktivFirma?.rolle === 'geschaeftsfuehrung'

  async function laden() {
    if (!aktivFirma) return
    setLadeStatus('laedt')
    const [{ data: mData, error: mFehler }, eErgebnis] = await Promise.all([
      supabase
        .from('firma_mitglieder')
        .select('id, nutzer_id, rolle, abteilung, freigabe_limit_cents, profile(vollname, email)')
        .eq('firma_id', aktivFirma.id)
        .order('erstellt_am', { ascending: true }),
      istAdmin
        ? supabase
            .from('firma_einladungen')
            .select('id, rolle, abteilung, status, token, erstellt_am')
            .eq('firma_id', aktivFirma.id)
            .eq('status', 'offen')
            .order('erstellt_am', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (!mFehler && mData) {
      setMitglieder(
        (mData as unknown as Array<Omit<Mitglied, 'profile'> & { profile: Mitglied['profile'] | Mitglied['profile'][] }>).map((m) => ({
          ...m,
          profile: Array.isArray(m.profile) ? (m.profile[0] ?? null) : m.profile,
        }))
      )
    }
    if (!eErgebnis.error && eErgebnis.data) setEinladungen(eErgebnis.data as Einladung[])
    setLadeStatus('bereit')
  }

  useEffect(() => {
    laden()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivFirma?.id])

  async function einladungErstellen() {
    if (!aktivFirma) return
    setWirdErstellt(true)
    setFehler(null)
    const { data, error } = await supabase.rpc('firma_einladung_erstellen', {
      p_firma_id: aktivFirma.id,
      p_rolle: neueRolle,
      p_abteilung: neueAbteilung || null,
    })
    setWirdErstellt(false)
    if (error) { setFehler(error.message); return }
    setNeuerLink(`${window.location.origin}/firma-einladung/${data}`)
    setNeueAbteilung('')
    laden()
  }

  async function einladungZuruecknehmen(id: string) {
    if (!confirm('Diese Einladung zurückziehen?')) return
    await supabase.from('firma_einladungen').update({ status: 'zurueckgezogen' }).eq('id', id)
    laden()
  }

  async function mitgliedEntfernen(id: string, name: string) {
    if (!confirm(`${name} wirklich aus der Firma entfernen?`)) return
    await supabase.from('firma_mitglieder').delete().eq('id', id)
    laden()
  }

  function linkKopieren(token: string) {
    const link = `${window.location.origin}/firma-einladung/${token}`
    navigator.clipboard?.writeText(link)
    setKopiertToken(token)
    setTimeout(() => setKopiertToken(null), 1800)
  }

  async function limitSpeichern(id: string) {
    if (!limitBearbeitung) return
    setLimitSpeichert(true)
    const roh = limitBearbeitung.wert.trim().replace(',', '.')
    const neuesLimitCents = roh === '' ? null : Math.round(parseFloat(roh) * 100)
    if (roh !== '' && Number.isNaN(neuesLimitCents)) {
      setLimitSpeichert(false)
      return
    }
    await supabase.from('firma_mitglieder').update({ freigabe_limit_cents: neuesLimitCents }).eq('id', id)
    setLimitSpeichert(false)
    setLimitBearbeitung(null)
    laden()
  }

  if (!aktivFirma) return null

  const ohneFreigabe = mitglieder.filter((m) => m.rolle !== 'inhaber' && m.rolle !== 'geschaeftsfuehrung' && m.freigabe_limit_cents == null).length

  return (
    <AppShell
      title="Team"
      subtitle={aktivFirma.name}
      actions={istAdmin ? (
        <button style={knopfStil} onClick={() => { setFormOffen(!formOffen); setNeuerLink(null); setFehler(null) }}>
          {formOffen ? 'Abbrechen' : '+ Kolleg:in einladen'}
        </button>
      ) : undefined}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14, marginBottom: 22 }}>
        <div className="block olive-deep" style={{ gridColumn: 'span 5', minWidth: 220 }}>
          <div className="block-ticks" />
          <div className="block-lbl">Team-Mitglieder</div>
          <div className="block-num" style={{ fontSize: 'clamp(34px, 3.6vw, 56px)' }}>{mitglieder.length}</div>
          <div className="block-sub">{aktivFirma.name}</div>
        </div>
        {istAdmin && (
          <>
            <div className={`block ${ohneFreigabe > 0 ? 'terracotta' : 'sage'}`} style={{ gridColumn: 'span 4', minWidth: 200 }}>
              <div className="block-lbl">Ohne Freigabelimit</div>
              <div className="block-num" style={{ fontSize: 'clamp(28px, 3vw, 44px)' }}>{ohneFreigabe}</div>
              <div className="block-sub">{ohneFreigabe > 0 ? 'können keinen Auftrag selbst erteilen' : 'alle Mitglieder abgedeckt'}</div>
            </div>
            <div className="block mustard" style={{ gridColumn: 'span 3', minWidth: 160 }}>
              <div className="block-lbl">Offene Einladungen</div>
              <div className="block-num" style={{ fontSize: 'clamp(28px, 3vw, 44px)' }}>{einladungen.length}</div>
            </div>
          </>
        )}
      </div>

      {formOffen && (
        <div style={{ ...karteStil, marginBottom: 20 }}>
          {!neuerLink ? (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>Rolle</label>
                  <select style={eingabeStil} value={neueRolle} onChange={(e) => setNeueRolle(e.target.value)}>
                    {Object.entries(rolleLabel).map(([wert, label]) => (
                      <option key={wert} value={wert}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>Abteilung (optional)</label>
                  <input style={eingabeStil} value={neueAbteilung} onChange={(e) => setNeueAbteilung(e.target.value)} placeholder="z.B. Buchhaltung" />
                </div>
              </div>
              {fehler && <p style={{ color: 'var(--red)', fontSize: 12.5, margin: '4px 0 0' }}>{fehler}</p>}
              <button style={{ ...knopfStil, marginTop: 10 }} disabled={wirdErstellt} onClick={einladungErstellen}>
                {wirdErstellt ? 'Erstelle Link …' : 'Einladungslink erstellen'}
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--ink-dim)' }}>
                Link erstellt – teile ihn mit der eingeladenen Person (z.B. per WhatsApp oder E-Mail):
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ fontSize: 12, background: 'rgba(40,28,14,.06)', padding: '8px 12px', borderRadius: 10, wordBreak: 'break-all' }}>
                  {neuerLink}
                </code>
                <button
                  style={knopfSekundaerStil}
                  onClick={() => { navigator.clipboard?.writeText(neuerLink); setKopiertToken('neu'); setTimeout(() => setKopiertToken(null), 1800) }}
                >
                  {kopiertToken === 'neu' ? 'Kopiert ✓' : 'Kopieren'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <h3 style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 8px', fontWeight: 700 }}>
        Mitglieder ({mitglieder.length})
      </h3>
      <div style={{ ...karteStil, padding: '6px 8px', marginBottom: 24 }}>
        {ladeStatus === 'laedt' && <p style={{ padding: 12, color: 'var(--ink-faint)', fontSize: 13 }}>Lädt …</p>}
        {ladeStatus === 'bereit' && mitglieder.length === 0 && (
          <p style={{ padding: 12, color: 'var(--ink-faint)', fontSize: 13 }}>Keine Mitglieder gefunden.</p>
        )}
        {mitglieder.map((m) => {
          const istUnbegrenzt = m.rolle === 'inhaber' || m.rolle === 'geschaeftsfuehrung'
          const bearbeitetGerade = limitBearbeitung?.id === m.id
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 10px', borderBottom: '1px solid rgba(40,28,14,.08)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.profile?.vollname || m.profile?.email || 'Unbekannt'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                  {m.profile?.email}{m.abteilung ? ` · ${m.abteilung}` : ''}
                </div>
              </div>
              <span style={pillStil('neutral')}>{rolleLabel[m.rolle] ?? m.rolle}</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 190 }}>
                {istUnbegrenzt ? (
                  <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>Freigabe: unbegrenzt</span>
                ) : bearbeitetGerade ? (
                  <>
                    <input
                      style={{ ...eingabeStil, width: 90, padding: '5px 8px', fontSize: 12 }}
                      value={limitBearbeitung.wert}
                      onChange={(e) => setLimitBearbeitung({ id: m.id, wert: e.target.value })}
                      placeholder="z.B. 5000"
                      autoFocus
                    />
                    <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>€</span>
                    <button
                      style={{ ...knopfSekundaerStil, padding: '5px 9px', fontSize: 11 }}
                      disabled={limitSpeichert}
                      onClick={() => limitSpeichern(m.id)}
                    >
                      {limitSpeichert ? '…' : 'OK'}
                    </button>
                    <button
                      style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ink-faint)' }}
                      onClick={() => setLimitBearbeitung(null)}
                    >
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                      Freigabe: {m.freigabe_limit_cents != null ? `bis ${(m.freigabe_limit_cents / 100).toLocaleString('de-DE')} €` : 'kein Limit hinterlegt'}
                    </span>
                    {istAdmin && (
                      <button
                        style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--orange-text)' }}
                        onClick={() => setLimitBearbeitung({ id: m.id, wert: centsZuEuroEingabe(m.freigabe_limit_cents) })}
                      >
                        Bearbeiten
                      </button>
                    )}
                  </>
                )}
              </div>

              {istAdmin && m.rolle !== 'inhaber' && (
                <button
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--red)' }}
                  onClick={() => mitgliedEntfernen(m.id, m.profile?.vollname || m.profile?.email || 'diese Person')}
                >
                  Entfernen
                </button>
              )}
            </div>
          )
        })}
      </div>

      {istAdmin && einladungen.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 8px', fontWeight: 700 }}>
            Offene Einladungen ({einladungen.length})
          </h3>
          <div style={{ ...karteStil, padding: '6px 8px' }}>
            {einladungen.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 10px', borderBottom: '1px solid rgba(40,28,14,.08)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {rolleLabel[e.rolle] ?? e.rolle}{e.abteilung ? ` · ${e.abteilung}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                    erstellt {new Date(e.erstellt_am).toLocaleDateString('de-DE')}
                  </div>
                </div>
                <button style={{ ...knopfSekundaerStil, padding: '7px 12px', fontSize: 11 }} onClick={() => linkKopieren(e.token)}>
                  {kopiertToken === e.token ? 'Kopiert ✓' : 'Link kopieren'}
                </button>
                <button
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--red)' }}
                  onClick={() => einladungZuruecknehmen(e.id)}
                >
                  Zurückziehen
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="footnote">
        Das Freigabelimit legt fest, bis zu welcher Auftragssumme ein Mitglied selbst einen Auftrag
        erteilen darf (z.B. „Zahlungen bis 5.000 €") – ohne hinterlegtes Limit kann das Mitglied
        keinen Auftrag erteilen, nur ansehen. Inhaber und Geschäftsführung sind immer unbegrenzt
        freigabeberechtigt. Der Versand von Einladungslinks läuft aktuell manuell – ein eigener
        E-Mail-Versand ist für eine spätere Phase vorgesehen.
      </p>
    </AppShell>
  )
}
