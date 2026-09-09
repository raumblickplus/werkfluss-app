import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import Marke from '../components/Marke'
import { karteStil, eingabeStil, knopfStil, knopfSekundaerStil, pillStil } from './stil'

type Tab = 'katalog' | 'bestellungen' | 'profil'

const tabs: { key: Tab; label: string }[] = [
  { key: 'katalog', label: 'Produktkatalog' },
  { key: 'bestellungen', label: 'Musterbestellungen' },
  { key: 'profil', label: 'Profil' },
]

type Produkt = {
  id: string
  name: string
  kategorie: string | null
  beschreibung: string | null
  bild_url: string | null
  musterbestellbar: boolean
  aktiv: boolean
}

type Bestellung = {
  id: string
  status: string
  lieferadresse: string | null
  notiz: string | null
  erstellt_am: string
  hersteller_produkte: { name: string } | null
  projekte: { name: string; adresse: string | null } | null
}

type HerstellerProfil = {
  id: string
  name: string
  beschreibung: string | null
  logo_url: string | null
  kontakt_email: string | null
  kontakt_telefon: string | null
  website: string | null
}

const bestellStatusLabel: Record<string, string> = {
  angefragt: 'Angefragt',
  bestaetigt: 'Bestätigt',
  versendet: 'Versendet',
  storniert: 'Storniert',
}
const bestellStatusVariante: Record<string, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  angefragt: 'warn',
  bestaetigt: 'neutral',
  versendet: 'ok',
  storniert: 'bad',
}

// Eigenständige Oberfläche für Hersteller/Lieferanten-Accounts
// (0024_hersteller_lieferanten.sql) - bewusst kein <AppShell>, da diese
// Rolle projektunabhängig ist und mit Bautagebuch/Ausschreibung/Finanzen
// etc. nichts anfangen kann. Drei Bereiche: eigener Produktkatalog (wird
// projektübergreifend in Projektmappe/Kundenansicht durchsucht), eingehende
// Musterbestellungen, Profil.
export default function HerstellerPortal() {
  const { aktivHersteller, signOut } = useAuth()
  const [aktivTab, setAktivTab] = useState<Tab>('katalog')
  const [produkte, setProdukte] = useState<Produkt[]>([])
  const [bestellungen, setBestellungen] = useState<Bestellung[]>([])
  const [profil, setProfil] = useState<HerstellerProfil | null>(null)
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  async function produkteLaden() {
    if (!aktivHersteller) return
    const { data } = await supabase
      .from('hersteller_produkte')
      .select('id, name, kategorie, beschreibung, bild_url, musterbestellbar, aktiv')
      .eq('hersteller_id', aktivHersteller.id)
      .order('erstellt_am', { ascending: false })
    setProdukte((data ?? []) as Produkt[])
  }

  async function bestellungenLaden() {
    if (!aktivHersteller) return
    const { data } = await supabase
      .from('musterbestellungen')
      .select('id, status, lieferadresse, notiz, erstellt_am, hersteller_produkte(name), projekte(name, adresse)')
      .eq('hersteller_id', aktivHersteller.id)
      .order('erstellt_am', { ascending: false })
    setBestellungen((data ?? []) as unknown as Bestellung[])
  }

  async function profilLaden() {
    if (!aktivHersteller) return
    const { data } = await supabase
      .from('hersteller')
      .select('id, name, beschreibung, logo_url, kontakt_email, kontakt_telefon, website')
      .eq('id', aktivHersteller.id)
      .maybeSingle()
    setProfil((data as HerstellerProfil) ?? null)
  }

  useEffect(() => {
    async function alles() {
      setLadeStatus('laedt')
      await Promise.all([produkteLaden(), bestellungenLaden(), profilLaden()])
      setLadeStatus('bereit')
    }
    alles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivHersteller?.id])

  async function bestellStatusAendern(b: Bestellung, neuerStatus: string) {
    setBestellungen((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: neuerStatus } : x)))
    await supabase.from('musterbestellungen').update({ status: neuerStatus }).eq('id', b.id)
  }

  if (!aktivHersteller) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...karteStil, maxWidth: 380, textAlign: 'center' }}>
          <p style={{ margin: 0 }}>Lädt …</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: 12 }}>
        <Marke mitWort groesse={30} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{aktivHersteller.name}</span>
          <span style={pillStil('neutral')}>Hersteller/Lieferant</span>
          <button style={knopfSekundaerStil} onClick={() => signOut()}>Abmelden</button>
        </div>
      </div>

      <div className="tabs" style={{ padding: '14px 24px 0' }}>
        {tabs.map((t) => (
          <button key={t.key} className={`tab${t.key === aktivTab ? ' active' : ''}`} onClick={() => setAktivTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ladeStatus === 'laedt' ? (
          <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
        ) : aktivTab === 'katalog' ? (
          <ProduktKatalog herstellerId={aktivHersteller.id} produkte={produkte} onGeaendert={produkteLaden} />
        ) : aktivTab === 'bestellungen' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bestellungen.length === 0 ? (
              <p style={{ color: 'var(--ink-faint)' }}>Noch keine Musterbestellungen eingegangen.</p>
            ) : (
              bestellungen.map((b) => (
                <div key={b.id} style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{b.hersteller_produkte?.name ?? 'Produkt'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>
                        {b.projekte?.name}
                        {b.projekte?.adresse ? ` · ${b.projekte.adresse}` : ''}
                      </div>
                    </div>
                    <span style={pillStil(bestellStatusVariante[b.status] ?? 'neutral')}>{bestellStatusLabel[b.status] ?? b.status}</span>
                  </div>
                  {b.lieferadresse && <div style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>Lieferadresse: {b.lieferadresse}</div>}
                  {b.notiz && <div style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>Notiz: {b.notiz}</div>}
                  {b.status !== 'storniert' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {b.status === 'angefragt' && (
                        <button style={knopfStil} onClick={() => bestellStatusAendern(b, 'bestaetigt')}>Bestätigen</button>
                      )}
                      {b.status === 'bestaetigt' && (
                        <button style={knopfStil} onClick={() => bestellStatusAendern(b, 'versendet')}>Als versendet markieren</button>
                      )}
                      <button style={knopfSekundaerStil} onClick={() => bestellStatusAendern(b, 'storniert')}>Stornieren</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          profil && <ProfilFormular profil={profil} istAdmin={aktivHersteller.rolle === 'inhaber'} onGeaendert={profilLaden} />
        )}
      </div>
    </div>
  )
}

function ProduktKatalog({
  herstellerId,
  produkte,
  onGeaendert,
}: {
  herstellerId: string
  produkte: Produkt[]
  onGeaendert: () => Promise<void>
}) {
  const [formOffen, setFormOffen] = useState(false)
  const [name, setName] = useState('')
  const [kategorie, setKategorie] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [musterbestellbar, setMusterbestellbar] = useState(true)
  const [bilddatei, setBilddatei] = useState<File | null>(null)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  function zuruecksetzen() {
    setName('')
    setKategorie('')
    setBeschreibung('')
    setMusterbestellbar(true)
    setBilddatei(null)
    setFehler(null)
  }

  async function produktAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setWirdGespeichert(true)
    setFehler(null)
    try {
      let bildUrl: string | null = null
      if (bilddatei) {
        const endung = bilddatei.name.split('.').pop() || 'jpg'
        const pfad = `${herstellerId}/${crypto.randomUUID()}.${endung}`
        const { error: uploadFehler } = await supabase.storage.from('hersteller-produkte').upload(pfad, await bilddatei.arrayBuffer(), {
          contentType: bilddatei.type || 'application/octet-stream',
          cacheControl: '3600',
          upsert: false,
        })
        if (uploadFehler) throw uploadFehler
        bildUrl = supabase.storage.from('hersteller-produkte').getPublicUrl(pfad).data.publicUrl
      }
      const { error: insertFehler } = await supabase.from('hersteller_produkte').insert({
        hersteller_id: herstellerId,
        name: name.trim(),
        kategorie: kategorie.trim() || null,
        beschreibung: beschreibung.trim() || null,
        musterbestellbar,
        bild_url: bildUrl,
      })
      if (insertFehler) throw insertFehler
      zuruecksetzen()
      setFormOffen(false)
      await onGeaendert()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Konnte nicht gespeichert werden.')
    } finally {
      setWirdGespeichert(false)
    }
  }

  async function produktAktivSchalten(p: Produkt) {
    await supabase.from('hersteller_produkte').update({ aktiv: !p.aktiv }).eq('id', p.id)
    await onGeaendert()
  }

  async function produktLoeschen(p: Produkt) {
    if (!confirm(`„${p.name}" wirklich entfernen?`)) return
    await supabase.from('hersteller_produkte').delete().eq('id', p.id)
    await onGeaendert()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, margin: 0 }}>Produktkatalog</h2>
        <button style={formOffen ? knopfSekundaerStil : knopfStil} onClick={() => setFormOffen((v) => !v)}>
          {formOffen ? 'Abbrechen' : '+ Produkt hinzufügen'}
        </button>
      </div>

      {formOffen && (
        <form onSubmit={produktAnlegen} style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <input style={eingabeStil} value={name} onChange={(e) => setName(e.target.value)} placeholder="Produktname, z. B. Feinsteinzeug Anthrazit" required />
            <input style={eingabeStil} value={kategorie} onChange={(e) => setKategorie(e.target.value)} placeholder="Kategorie, z. B. Boden" />
            <input style={eingabeStil} type="file" accept="image/*" onChange={(e) => setBilddatei(e.target.files?.[0] ?? null)} />
          </div>
          <textarea
            style={{ ...eingabeStil, minHeight: 56, resize: 'vertical' }}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="Beschreibung (optional)"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-dim)' }}>
            <input type="checkbox" checked={musterbestellbar} onChange={(e) => setMusterbestellbar(e.target.checked)} />
            Kostenfreie Musterbestellung möglich
          </label>
          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
          <div>
            <button type="submit" style={knopfStil} disabled={wirdGespeichert || !name.trim()}>
              {wirdGespeichert ? 'Speichert …' : 'Hinzufügen'}
            </button>
          </div>
        </form>
      )}

      {produkte.length === 0 ? (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Produkte im Katalog.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {produkte.map((p) => (
            <div key={p.id} style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 8, opacity: p.aktiv ? 1 : 0.5 }}>
              <div style={{ height: 110, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.bild_url ? <img src={p.bild_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Kein Bild</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</div>
              {p.kategorie && <div style={{ fontSize: 11.5, color: 'var(--ink-dim)' }}>{p.kategorie}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {!p.aktiv && <span style={pillStil('neutral')}>Deaktiviert</span>}
                {p.musterbestellbar && <span style={pillStil('ok')}>Musterbestellung</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...knopfSekundaerStil, flex: 1 }} onClick={() => produktAktivSchalten(p)}>
                  {p.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button style={{ ...knopfSekundaerStil, color: 'var(--red)' }} onClick={() => produktLoeschen(p)}>
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProfilFormular({ profil, istAdmin, onGeaendert }: { profil: HerstellerProfil; istAdmin: boolean; onGeaendert: () => Promise<void> }) {
  const [name, setName] = useState(profil.name)
  const [beschreibung, setBeschreibung] = useState(profil.beschreibung ?? '')
  const [kontaktEmail, setKontaktEmail] = useState(profil.kontakt_email ?? '')
  const [kontaktTelefon, setKontaktTelefon] = useState(profil.kontakt_telefon ?? '')
  const [website, setWebsite] = useState(profil.website ?? '')
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gespeichert, setGespeichert] = useState(false)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    setWirdGespeichert(true)
    setFehler(null)
    setGespeichert(false)
    const { error } = await supabase
      .from('hersteller')
      .update({
        name: name.trim(),
        beschreibung: beschreibung.trim() || null,
        kontakt_email: kontaktEmail.trim() || null,
        kontakt_telefon: kontaktTelefon.trim() || null,
        website: website.trim() || null,
      })
      .eq('id', profil.id)
    if (error) {
      setFehler(error.message)
    } else {
      setGespeichert(true)
      await onGeaendert()
    }
    setWirdGespeichert(false)
  }

  return (
    <form onSubmit={speichern} style={{ ...karteStil, maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, margin: 0 }}>Herstellerprofil</h2>
      {!istAdmin && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>
          Nur Profilinhaber:innen können diese Angaben bearbeiten.
        </p>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
        Name
        <input style={eingabeStil} value={name} onChange={(e) => setName(e.target.value)} disabled={!istAdmin} required />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
        Beschreibung
        <textarea style={{ ...eingabeStil, minHeight: 64, resize: 'vertical' }} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} disabled={!istAdmin} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
        Kontakt-E-Mail
        <input style={eingabeStil} value={kontaktEmail} onChange={(e) => setKontaktEmail(e.target.value)} disabled={!istAdmin} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
        Telefon
        <input style={eingabeStil} value={kontaktTelefon} onChange={(e) => setKontaktTelefon(e.target.value)} disabled={!istAdmin} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)' }}>
        Website
        <input style={eingabeStil} value={website} onChange={(e) => setWebsite(e.target.value)} disabled={!istAdmin} />
      </label>
      {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
      {gespeichert && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-dim)' }}>Gespeichert.</p>}
      {istAdmin && (
        <div>
          <button type="submit" style={knopfStil} disabled={wirdGespeichert}>
            {wirdGespeichert ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      )}
    </form>
  )
}
