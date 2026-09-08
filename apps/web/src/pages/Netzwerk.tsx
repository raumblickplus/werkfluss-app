import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import AppShell from '../components/AppShell'
import { karteStil, eingabeStil, knopfStil, knopfSekundaerStil, pillStil } from './stil'

type Gewerk = { id: string; name: string; sortierung: number; firma_id: string | null }
type Typ = 'mitarbeiter' | 'firma'
type Kontakt = {
  id: string
  name: string
  typ: Typ
  gewerk_id: string | null
  telefon: string | null
  email: string | null
  website: string | null
  logo_url: string | null
}

// Rotierende Akzentfarben je Gewerk-Sektion – dieselbe Palette wie die
// Farbblock-Kacheln, hier als kleiner Farbpunkt statt grosser Flaeche,
// damit ein Verzeichnis mit vielen Eintraegen nicht ueberladen wirkt.
const AKZENTE = ['#C1552F', '#575D46', '#E2B62E', '#7C8566', '#9C4023', '#3F4433']
function akzentFuer(index: number) {
  return AKZENTE[index % AKZENTE.length]
}

function initialen(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

export default function Netzwerk() {
  const { aktivFirma } = useAuth()
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [kontakte, setKontakte] = useState<Kontakt[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  const [formOffen, setFormOffen] = useState(false)
  const [name, setName] = useState('')
  const [typ, setTyp] = useState<Typ>('firma')
  const [gewerkId, setGewerkId] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [logoDatei, setLogoDatei] = useState<File | null>(null)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [neuesGewerk, setNeuesGewerk] = useState('')
  const [gewerkFehler, setGewerkFehler] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: gData }, { data: kData }] = await Promise.all([
      supabase.from('gewerke').select('id, name, sortierung, firma_id').order('sortierung'),
      supabase
        .from('netzwerk_kontakte')
        .select('id, name, typ, gewerk_id, telefon, email, website, logo_url')
        .order('name'),
    ])
    setGewerke((gData ?? []) as Gewerk[])
    setKontakte((kData ?? []) as Kontakt[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [])

  function formZuruecksetzen() {
    setName('')
    setTyp('firma')
    setGewerkId('')
    setTelefon('')
    setEmail('')
    setWebsite('')
    setLogoDatei(null)
    setFehler(null)
  }

  async function kontaktErstellen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma || !name.trim()) return
    setWirdGespeichert(true)
    setFehler(null)
    try {
      let logoUrl: string | null = null
      if (logoDatei) {
        const endung = logoDatei.name.split('.').pop() || 'png'
        const pfad = `${aktivFirma.id}/${crypto.randomUUID()}.${endung}`
        const { error: uploadFehler } = await supabase.storage.from('logos').upload(pfad, logoDatei, {
          cacheControl: '3600',
          upsert: false,
        })
        if (uploadFehler) throw uploadFehler
        logoUrl = supabase.storage.from('logos').getPublicUrl(pfad).data.publicUrl
      }
      const { error: insertFehler } = await supabase.from('netzwerk_kontakte').insert({
        firma_id: aktivFirma.id,
        name: name.trim(),
        typ,
        gewerk_id: gewerkId || null,
        telefon: telefon.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        logo_url: logoUrl,
      })
      if (insertFehler) throw insertFehler
      formZuruecksetzen()
      setFormOffen(false)
      await laden()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Konnte nicht gespeichert werden.')
    } finally {
      setWirdGespeichert(false)
    }
  }

  async function kontaktLoeschen(k: Kontakt) {
    if (!confirm(`${k.name} wirklich aus dem Netzwerk entfernen?`)) return
    setKontakte((prev) => prev.filter((x) => x.id !== k.id))
    await supabase.from('netzwerk_kontakte').delete().eq('id', k.id)
  }

  async function gewerkErstellen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma || !neuesGewerk.trim()) return
    setGewerkFehler(null)
    const naechsteSortierung = gewerke.reduce((max, g) => Math.max(max, g.sortierung), 0) + 1
    const { error } = await supabase.from('gewerke').insert({
      firma_id: aktivFirma.id,
      name: neuesGewerk.trim(),
      sortierung: naechsteSortierung,
    })
    if (error) {
      setGewerkFehler(error.message.includes('duplicate') ? 'Dieses Gewerk gibt es schon.' : 'Konnte nicht gespeichert werden.')
      return
    }
    setNeuesGewerk('')
    await laden()
  }

  async function gewerkLoeschen(g: Gewerk) {
    if (!confirm(`Gewerk „${g.name}" wirklich löschen?`)) return
    setGewerke((prev) => prev.filter((x) => x.id !== g.id))
    await supabase.from('gewerke').delete().eq('id', g.id)
  }

  const sektionen = useMemo(() => {
    const gruppen = new Map<string, Kontakt[]>()
    for (const k of kontakte) {
      const key = k.gewerk_id ?? '__ohne__'
      if (!gruppen.has(key)) gruppen.set(key, [])
      gruppen.get(key)!.push(k)
    }
    const geordnet = gewerke
      .filter((g) => gruppen.has(g.id))
      .map((g, i) => ({ titel: g.name, kontakte: gruppen.get(g.id)!, akzent: akzentFuer(i) }))
    if (gruppen.has('__ohne__')) {
      geordnet.push({ titel: 'Ohne Gewerk', kontakte: gruppen.get('__ohne__')!, akzent: 'var(--ink-faint)' })
    }
    return geordnet
  }, [kontakte, gewerke])

  return (
    <AppShell
      title="Netzwerk"
      subtitle={aktivFirma?.name}
      wide
      actions={
        <button style={knopfStil} onClick={() => setFormOffen((v) => !v)}>
          {formOffen ? 'Abbrechen' : '+ Kontakt hinzufügen'}
        </button>
      }
    >
      {formOffen && (
        <form onSubmit={kontaktErstellen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setTyp('firma')}
              style={typ === 'firma' ? knopfStil : knopfSekundaerStil}
            >
              Firma
            </button>
            <button
              type="button"
              onClick={() => setTyp('mitarbeiter')}
              style={typ === 'mitarbeiter' ? knopfStil : knopfSekundaerStil}
            >
              Mitarbeiter:in
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="field">
              <label className="field-label">Name</label>
              <input style={eingabeStil} value={name} onChange={(e) => setName(e.target.value)} placeholder={typ === 'firma' ? 'z. B. Elektro Schmidt GmbH' : 'Vor- und Nachname'} required />
            </div>
            <div className="field">
              <label className="field-label">Gewerk</label>
              <select style={eingabeStil} value={gewerkId} onChange={(e) => setGewerkId(e.target.value)}>
                <option value="">Ohne Gewerk</option>
                {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Telefon</label>
              <input style={eingabeStil} value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Optional" />
            </div>
            <div className="field">
              <label className="field-label">E-Mail</label>
              <input style={eingabeStil} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
            </div>
            <div className="field">
              <label className="field-label">Website</label>
              <input style={eingabeStil} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Optional" />
            </div>
            <div className="field">
              <label className="field-label">Logo</label>
              <input
                style={eingabeStil}
                type="file"
                accept="image/*"
                onChange={(e) => setLogoDatei(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}

          <div>
            <button type="submit" style={knopfStil} disabled={wirdGespeichert || !name.trim()}>
              {wirdGespeichert ? 'Speichert …' : 'Hinzufügen'}
            </button>
          </div>
        </form>
      )}

      <div style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0 }}>Gewerke</h2>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
            Feste Liste plus eigene, firmenspezifische Ergänzungen
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {gewerke.map((g) => {
            const eigenes = g.firma_id === aktivFirma?.id
            return (
              <span
                key={g.id}
                style={{
                  ...pillStil('neutral'),
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  ...(eigenes ? { border: '1px solid var(--olive-light)' } : {}),
                }}
              >
                {g.name}
                {eigenes && (
                  <button
                    onClick={() => gewerkLoeschen(g)}
                    title="Eigenes Gewerk entfernen"
                    style={{ all: 'unset', cursor: 'pointer', fontSize: 12, lineHeight: 1, color: 'var(--ink-faint)' }}
                  >
                    ×
                  </button>
                )}
              </span>
            )
          })}
        </div>
        <form onSubmit={gewerkErstellen} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...eingabeStil, maxWidth: 240 }}
            value={neuesGewerk}
            onChange={(e) => setNeuesGewerk(e.target.value)}
            placeholder="Neues Gewerk, z. B. Photovoltaik"
          />
          <button type="submit" style={knopfSekundaerStil} disabled={!neuesGewerk.trim()}>
            + Gewerk
          </button>
          {gewerkFehler && <span style={{ fontSize: 12, color: 'var(--red)' }}>{gewerkFehler}</span>}
        </form>
      </div>

      {ladeStatus === 'laedt' ? (
        <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
      ) : kontakte.length === 0 ? (
        <div style={karteStil}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
            Noch kein Netzwerk angelegt. Füge Mitarbeitende und Partnerfirmen je Gewerk hinzu, damit du bei der
            Vergabe schnell siehst, wer für welches Gewerk zur Verfügung steht.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {sektionen.map((sektion) => (
            <div key={sektion.titel}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: sektion.akzent, flexShrink: 0 }} />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: 0 }}>{sektion.titel}</h2>
                <span style={pillStil('neutral')}>{sektion.kontakte.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {sektion.kontakte.map((k) => (
                  <div key={k.id} style={{ ...karteStil, padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
                    <button
                      onClick={() => kontaktLoeschen(k)}
                      title="Entfernen"
                      style={{
                        all: 'unset', position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--ink-faint)', cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                    {k.logo_url ? (
                      <img
                        src={k.logo_url}
                        alt={k.name}
                        style={{ width: 60, height: 60, borderRadius: 16, objectFit: 'cover', background: 'var(--surface)' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 60, height: 60, borderRadius: 16, background: sektion.akzent, color: 'var(--on-accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
                        }}
                      >
                        {initialen(k.name)}
                      </div>
                    )}
                    <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {k.name}
                    </div>
                    <span style={pillStil(k.typ === 'firma' ? 'neutral' : 'ok')}>
                      {k.typ === 'firma' ? 'Firma' : 'Mitarbeiter:in'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="footnote">
        Dieses Netzwerk ist firmenweit sichtbar für alle Mitglieder – gedacht als schnelle Übersicht, wer für
        welches Gewerk zur Verfügung steht, unabhängig von einem einzelnen Projekt. Die Zuordnung „wer arbeitet an
        welchem Projekt" bleibt weiterhin bei den projektbezogenen Beteiligten je Projekt.
      </p>
    </AppShell>
  )
}
