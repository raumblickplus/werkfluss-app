import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import AdresseSuche, { googleAdresssucheVerfuegbar } from '../../components/AdresseSuche'
import { eingabeStil, knopfStil, karteStil, projektStatusLabel } from '../stil'

export type ProjektDetails = {
  id: string
  name: string
  adresse: string | null
  status: string
  vorhabenart: string | null
  gebaeudeklasse: string | null
  kunde_name: string | null
  kunde_kontakt: string | null
  kunde_rechnungsadresse: string | null
  start_datum: string | null
  end_datum_geplant: string | null
}

type Beteiligter = {
  id: string
  name: string
  rolle: string | null
  kontakt: string | null
}

const vorhabenartLabel: Record<string, string> = {
  neubau: 'Neubau',
  sanierung: 'Sanierung/Umbau',
  anbau: 'Anbau/Erweiterung',
}

const gebaeudeklasseOptionen = [
  'Wohnung/ETW',
  'Einfamilienhaus',
  'Mehrfamilienhaus',
  'Hochhaus',
  'Gebäudekomplex',
  'Gewerbe/Sonderbau',
]

export default function Uebersicht({
  projekt,
  onAktualisiert,
}: {
  projekt: ProjektDetails
  onAktualisiert: () => void
}) {
  const [form, setForm] = useState(projekt)
  const [neueKoordinaten, setNeueKoordinaten] = useState<{ breitengrad: number; laengengrad: number } | null>(null)
  const [speichertStatus, setSpeichertStatus] = useState<'inaktiv' | 'speichert' | 'gespeichert'>('inaktiv')
  const googleAktiv = googleAdresssucheVerfuegbar()

  useEffect(() => { setForm(projekt); setNeueKoordinaten(null) }, [projekt])

  async function speichern(e: FormEvent) {
    e.preventDefault()
    setSpeichertStatus('speichert')

    const { error } = await supabase
      .from('projekte')
      .update({
        adresse: form.adresse || null,
        status: form.status,
        vorhabenart: form.vorhabenart || null,
        gebaeudeklasse: form.gebaeudeklasse || null,
        kunde_name: form.kunde_name || null,
        kunde_kontakt: form.kunde_kontakt || null,
        kunde_rechnungsadresse: form.kunde_rechnungsadresse || null,
        start_datum: form.start_datum || null,
        end_datum_geplant: form.end_datum_geplant || null,
        ...(neueKoordinaten ?? {}),
      })
      .eq('id', projekt.id)

    setSpeichertStatus(error ? 'inaktiv' : 'gespeichert')
    if (!error) onAktualisiert()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <form onSubmit={speichern} style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: 0 }}>Projektdaten</h2>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
          Baustellen-Adresse
          {form.adresse && (
            <div style={{ fontSize: 13, color: 'var(--ink)', padding: '8px 0' }}>{form.adresse}</div>
          )}
          {googleAktiv ? (
            <AdresseSuche
              platzhalter={form.adresse ? 'Andere Adresse suchen …' : 'Adresse eingeben und Vorschlag auswählen …'}
              onAuswahl={(a) => {
                setForm({ ...form, adresse: a.adresse })
                setNeueKoordinaten({ breitengrad: a.breitengrad, laengengrad: a.laengengrad })
              }}
            />
          ) : (
            <input style={eingabeStil} value={form.adresse ?? ''} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
          )}
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Status
            <select style={eingabeStil} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(projektStatusLabel).map(([wert, label]) => (
                <option key={wert} value={wert}>{label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Vorhabenart
            <select
              style={eingabeStil}
              value={form.vorhabenart ?? ''}
              onChange={(e) => setForm({ ...form, vorhabenart: e.target.value })}
            >
              <option value="">– nicht gesetzt –</option>
              {Object.entries(vorhabenartLabel).map(([wert, label]) => (
                <option key={wert} value={wert}>{label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Gebäudeklasse
            <select
              style={eingabeStil}
              value={form.gebaeudeklasse ?? ''}
              onChange={(e) => setForm({ ...form, gebaeudeklasse: e.target.value })}
            >
              <option value="">– nicht gesetzt –</option>
              {gebaeudeklasseOptionen.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Baubeginn (geplant)
            <input
              style={eingabeStil}
              type="date"
              value={form.start_datum ?? ''}
              onChange={(e) => setForm({ ...form, start_datum: e.target.value })}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Fertigstellung (geplant)
            <input
              style={eingabeStil}
              type="date"
              value={form.end_datum_geplant ?? ''}
              onChange={(e) => setForm({ ...form, end_datum_geplant: e.target.value })}
            />
          </label>
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-faint)' }}>
          Baubeginn und geplante Fertigstellung steuern die Zeitstrahl-Ansicht im Modul „Zeitplan".
        </p>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '8px 0 0' }}>Bauherr / Kunde</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Name
            <input style={eingabeStil} value={form.kunde_name ?? ''} onChange={(e) => setForm({ ...form, kunde_name: e.target.value })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Kontakt (Telefon/E-Mail)
            <input style={eingabeStil} value={form.kunde_kontakt ?? ''} onChange={(e) => setForm({ ...form, kunde_kontakt: e.target.value })} />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
          Rechnungsadresse (falls abweichend von der Baustelle)
          {form.kunde_rechnungsadresse && (
            <div style={{ fontSize: 13, color: 'var(--ink)', padding: '8px 0' }}>{form.kunde_rechnungsadresse}</div>
          )}
          {googleAktiv ? (
            <AdresseSuche
              platzhalter="Rechnungsadresse suchen …"
              onAuswahl={(a) => setForm({ ...form, kunde_rechnungsadresse: a.adresse })}
            />
          ) : (
            <input
              style={eingabeStil}
              value={form.kunde_rechnungsadresse ?? ''}
              onChange={(e) => setForm({ ...form, kunde_rechnungsadresse: e.target.value })}
            />
          )}
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" style={knopfStil} disabled={speichertStatus === 'speichert'}>
            {speichertStatus === 'speichert' ? 'Speichert …' : 'Speichern'}
          </button>
          {speichertStatus === 'gespeichert' && <span style={{ color: 'var(--olive)', fontSize: 13 }}>Gespeichert ✓</span>}
        </div>
      </form>

      <FirmenBeteiligte projektId={projekt.id} />
      <BeteiligteListe projektId={projekt.id} />
    </div>
  )
}

function BeteiligteListe({ projektId }: { projektId: string }) {
  const [beteiligte, setBeteiligte] = useState<Beteiligter[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [name, setName] = useState('')
  const [rolle, setRolle] = useState('')
  const [kontakt, setKontakt] = useState('')

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('projekt_beteiligte')
      .select('id, name, rolle, kontakt')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: true })

    if (error) { setLadeStatus('fehler'); return }
    setBeteiligte(data ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('projekt_beteiligte').insert({
      projekt_id: projektId,
      name,
      rolle: rolle || null,
      kontakt: kontakt || null,
    })
    if (!error) {
      setName(''); setRolle(''); setKontakt('')
      setZeigeFormular(false)
      laden()
    }
  }

  async function entfernen(id: string) {
    await supabase.from('projekt_beteiligte').delete().eq('id', id)
    laden()
  }

  return (
    <div style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: 0 }}>Beteiligte</h2>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Hinzufügen'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>
        Handwerker, Architekt, Bauherr & Co. als einfache Kontaktliste – ohne eigenes Werkfluss-Konto.
        Echte Firmen mit eigenem Login einladen (inkl. Verknüpfung zur Firma) ist der nächste Ausbauschritt.
      </p>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
            Name
            <input style={eingabeStil} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
            Rolle / Gewerk
            <input style={eingabeStil} value={rolle} onChange={(e) => setRolle(e.target.value)} placeholder="z.B. Elektriker" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
            Kontakt
            <input style={eingabeStil} value={kontakt} onChange={(e) => setKontakt(e.target.value)} placeholder="Telefon/E-Mail" />
          </label>
          <button type="submit" style={knopfStil}>Speichern</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)', margin: 0 }}>Lade …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)', margin: 0 }}>Konnte nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && beteiligte.length === 0 && (
        <p style={{ color: 'var(--ink-faint)', margin: 0 }}>Noch niemand hinterlegt.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {beteiligte.map((b) => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</span>
              {b.rolle && <span style={{ fontSize: 12, color: 'var(--ink-faint)', marginLeft: 8 }}>{b.rolle}</span>}
              {b.kontakt && <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{b.kontakt}</div>}
            </div>
            <button
              onClick={() => entfernen(b.id)}
              style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 12 }}
            >
              Entfernen
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}


type ProjektFirma = {
  id: string
  rolle_im_projekt: string
  gewerk: string | null
  firmen: { id: string; name: string } | null
}

type Einladung = {
  id: string
  rolle_im_projekt: string
  gewerk: string | null
  token: string
  status: string
  erstellt_am: string
}

const rolleLabelKarte: Record<string, string> = {
  generalunternehmer: 'Generalunternehmer',
  handwerker: 'Handwerker',
  architekt: 'Architekt',
  bauherr: 'Bauherr',
}

function FirmenBeteiligte({ projektId }: { projektId: string }) {
  const [firmenListe, setFirmenListe] = useState<ProjektFirma[]>([])
  const [einladungen, setEinladungen] = useState<Einladung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [rolle, setRolle] = useState('handwerker')
  const [gewerkEingabe, setGewerkEingabe] = useState('')
  const [neuerLink, setNeuerLink] = useState<string | null>(null)
  const [kopiertId, setKopiertId] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: firmenData, error: firmenFehler }, { data: einladungenData }] = await Promise.all([
      supabase
        .from('projekt_mitglieder')
        .select('id, rolle_im_projekt, gewerk, firmen(id, name)')
        .eq('projekt_id', projektId),
      supabase
        .from('projekt_einladungen')
        .select('id, rolle_im_projekt, gewerk, token, status, erstellt_am')
        .eq('projekt_id', projektId)
        .eq('status', 'offen')
        .order('erstellt_am', { ascending: false }),
    ])
    if (firmenFehler) { setLadeStatus('fehler'); return }
    setFirmenListe((firmenData ?? []) as unknown as ProjektFirma[])
    setEinladungen(einladungenData ?? [])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function einladen(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('einladung_erstellen', {
      p_projekt_id: projektId,
      p_rolle: rolle,
      p_gewerk: gewerkEingabe || null,
    })
    if (!error && data) {
      setNeuerLink(`${window.location.origin}/einladung/${data}`)
      setGewerkEingabe('')
      laden()
    }
  }

  async function zurueckziehen(id: string) {
    await supabase.from('projekt_einladungen').delete().eq('id', id)
    laden()
  }

  async function entfernen(id: string) {
    await supabase.from('projekt_mitglieder').delete().eq('id', id)
    laden()
  }

  function linkKopieren(token: string, id: string) {
    const link = `${window.location.origin}/einladung/${token}`
    navigator.clipboard?.writeText(link).then(() => {
      setKopiertId(id)
      setTimeout(() => setKopiertId(null), 1500)
    })
  }

  return (
    <div style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: 0 }}>Firmen im Projekt</h2>
        <button style={knopfStil} onClick={() => { setZeigeFormular((v) => !v); setNeuerLink(null) }}>
          {zeigeFormular ? 'Abbrechen' : '+ Firma einladen'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>
        Lade andere Firmen (Handwerker, Architekt, Bauherr) mit eigenem Werkfluss-Login zu diesem Projekt ein.
        Sie sehen dann nur dieses Projekt, nicht deine anderen.
      </p>

      {zeigeFormular && (
        <form onSubmit={einladen} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)' }}>
            Rolle
            <select style={eingabeStil} value={rolle} onChange={(e) => setRolle(e.target.value)}>
              <option value="handwerker">Handwerker</option>
              <option value="architekt">Architekt</option>
              <option value="bauherr">Bauherr</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
            Gewerk (optional)
            <input
              style={eingabeStil}
              value={gewerkEingabe}
              onChange={(e) => setGewerkEingabe(e.target.value)}
              placeholder="z.B. Elektroinstallation"
            />
          </label>
          <button type="submit" style={knopfStil}>Link erzeugen</button>
        </form>
      )}

      {neuerLink && (
        <div style={{ background: 'oklch(96% 0.02 90)', borderRadius: 10, padding: '10px 12px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--ink-dim)' }}>Link kopieren und der Firma schicken (z.B. per WhatsApp/E-Mail):</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={neuerLink} style={{ ...eingabeStil, flex: 1 }} onFocus={(e) => e.target.select()} />
            <button type="button" style={knopfStil} onClick={() => navigator.clipboard?.writeText(neuerLink)}>Kopieren</button>
          </div>
        </div>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)', margin: 0 }}>Lade …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)', margin: 0 }}>Konnte nicht geladen werden.</p>}

      {firmenListe.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {firmenListe.map((f) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{f.firmen?.name ?? 'Unbekannte Firma'}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-faint)', marginLeft: 8 }}>
                  {rolleLabelKarte[f.rolle_im_projekt] ?? f.rolle_im_projekt}{f.gewerk ? ` · ${f.gewerk}` : ''}
                </span>
              </div>
              <button onClick={() => entfernen(f.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 12 }}>
                Entfernen
              </button>
            </div>
          ))}
        </div>
      )}

      {einladungen.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-faint)' }}>Offene Einladungen</p>
          {einladungen.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>
                {rolleLabelKarte[e.rolle_im_projekt] ?? e.rolle_im_projekt}{e.gewerk ? ` · ${e.gewerk}` : ''}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => linkKopieren(e.token, e.id)} style={{ background: 'none', border: 'none', color: 'var(--orange-text)', cursor: 'pointer', fontSize: 12 }}>
                  {kopiertId === e.id ? 'Kopiert ✓' : 'Link kopieren'}
                </button>
                <button onClick={() => zurueckziehen(e.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 12 }}>
                  Zurückziehen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {ladeStatus === 'bereit' && firmenListe.length === 0 && einladungen.length === 0 && (
        <p style={{ color: 'var(--ink-faint)', margin: 0 }}>Noch keine Firma eingeladen.</p>
      )}
    </div>
  )
}
