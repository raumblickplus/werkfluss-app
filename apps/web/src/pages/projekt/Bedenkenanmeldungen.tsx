import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil, pillStil } from '../stil'

type FirmaMini = { id: string; name: string } | null
type Meldung = {
  id: string
  firma_id: string
  betrifft: string | null
  betreff: string
  beschreibung: string
  status: 'eingereicht' | 'beantwortet' | 'ausgeraeumt'
  antwort: string | null
  erstellt_am: string
  beantwortet_am: string | null
  firmen: FirmaMini
}

const STATUS_LABEL: Record<Meldung['status'], string> = {
  eingereicht: 'Eingereicht',
  beantwortet: 'Beantwortet',
  ausgeraeumt: 'Bedenken ausgeräumt',
}
const STATUS_VARIANTE: Record<Meldung['status'], 'ok' | 'warn' | 'neutral'> = {
  eingereicht: 'warn',
  beantwortet: 'neutral',
  ausgeraeumt: 'ok',
}

function formatZeitpunkt(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Bedenkenanmeldung nach VOB/B Paragraph 4 Abs. 3 (Konzept Abschnitt 8.10):
// schriftliche Mitteilung eines ausführenden Betriebs an den Auftraggeber,
// dass Bedenken gegen die vorgesehene Ausführung, gelieferte Stoffe/Bauteile
// oder Leistungen anderer Unternehmer bestehen - zentrales Instrument zur
// eigenen rechtlichen Absicherung, bisher komplett unumgesetzt.
export default function Bedenkenanmeldungen({ projektId, istEigentuemer }: { projektId: string; istEigentuemer: boolean }) {
  const { aktivFirma, session } = useAuth()
  const [meldungen, setMeldungen] = useState<Meldung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [betrifft, setBetrifft] = useState('')
  const [betreff, setBetreff] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [antwortEntwurf, setAntwortEntwurf] = useState<Record<string, string>>({})
  const [antwortLaeuftFuer, setAntwortLaeuftFuer] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const { data } = await supabase
      .from('bedenkenanmeldungen')
      .select('id, firma_id, betrifft, betreff, beschreibung, status, antwort, erstellt_am, beantwortet_am, firmen(id, name)')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: false })
    setMeldungen((data ?? []) as unknown as Meldung[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function einreichen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma) return
    if (!betreff.trim() || !beschreibung.trim()) { setFehler('Betreff und Beschreibung sind erforderlich.'); return }
    setSpeichert(true)
    setFehler(null)
    const { error } = await supabase.from('bedenkenanmeldungen').insert({
      projekt_id: projektId,
      firma_id: aktivFirma.id,
      betrifft: betrifft.trim() || null,
      betreff: betreff.trim(),
      beschreibung: beschreibung.trim(),
      erstellt_von: session?.user?.id ?? null,
    })
    setSpeichert(false)
    if (error) { setFehler('Konnte nicht eingereicht werden.'); return }
    setBetrifft(''); setBetreff(''); setBeschreibung('')
    setZeigeFormular(false)
    laden()
  }

  async function antworten(m: Meldung, neuerStatus: 'beantwortet' | 'ausgeraeumt') {
    setAntwortLaeuftFuer(m.id)
    await supabase
      .from('bedenkenanmeldungen')
      .update({ status: neuerStatus, antwort: (antwortEntwurf[m.id] ?? m.antwort ?? '').trim() || null, beantwortet_am: new Date().toISOString() })
      .eq('id', m.id)
    setAntwortLaeuftFuer(null)
    laden()
  }

  if (ladeStatus === 'laedt') return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Bedenken anmelden'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={einreichen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Betrifft (optional)
            <input style={eingabeStil} value={betrifft} onChange={(e) => setBetrifft(e.target.value)} placeholder="z. B. Untergrund für Fliesenverlegung, Vorleistung Elektro" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Betreff
            <input style={eingabeStil} value={betreff} onChange={(e) => setBetreff(e.target.value)} placeholder="z. B. Bedenken gegen vorgesehene Ausführung" required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Beschreibung
            <textarea
              style={{ ...eingabeStil, minHeight: 90, resize: 'vertical', fontFamily: 'var(--font-body)' }}
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Was genau spricht gegen die vorgesehene Ausführung, das Material oder die Vorleistung? So konkret wie möglich."
              required
            />
          </label>
          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
          <button type="submit" style={knopfStil} disabled={speichert || !betreff.trim() || !beschreibung.trim()}>
            {speichert ? 'Reicht ein …' : 'Bedenken einreichen'}
          </button>
        </form>
      )}

      {meldungen.length === 0 && <p style={{ color: 'var(--ink-faint)' }}>Noch keine Bedenkenanmeldungen.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {meldungen.map((m) => (
          <div key={m.id} style={karteStil}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>{m.betreff}</div>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--ink-faint)' }}>
                  {m.firmen?.name ?? 'Unbekannte Firma'} · {formatZeitpunkt(m.erstellt_am)}
                  {m.betrifft ? ` · betrifft: ${m.betrifft}` : ''}
                </p>
              </div>
              <span style={pillStil(STATUS_VARIANTE[m.status])}>{STATUS_LABEL[m.status]}</span>
            </div>

            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-dim)', whiteSpace: 'pre-wrap' }}>{m.beschreibung}</p>

            {m.antwort && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--glass-border)' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Antwort des Eigentümers{m.beantwortet_am ? ` · ${formatZeitpunkt(m.beantwortet_am)}` : ''}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-dim)', whiteSpace: 'pre-wrap' }}>{m.antwort}</p>
              </div>
            )}

            {istEigentuemer && m.status === 'eingereicht' && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  style={{ ...eingabeStil, minHeight: 64, resize: 'vertical', fontFamily: 'var(--font-body)' }}
                  placeholder="Antwort/Stellungnahme (optional, wird beim Beantworten gespeichert)"
                  value={antwortEntwurf[m.id] ?? ''}
                  onChange={(e) => setAntwortEntwurf((prev) => ({ ...prev, [m.id]: e.target.value }))}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={knopfSekundaerStil} onClick={() => antworten(m, 'beantwortet')} disabled={antwortLaeuftFuer === m.id}>
                    Als beantwortet markieren
                  </button>
                  <button style={knopfStil} onClick={() => antworten(m, 'ausgeraeumt')} disabled={antwortLaeuftFuer === m.id}>
                    Bedenken ausgeräumt
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="footnote">
        Formale Bedenkenanmeldung nach VOB/B § 4 Abs. 3 – dient der eigenen rechtlichen Absicherung vor
        Beginn der betroffenen Arbeiten. Sichtbar für den Eigentümer und die meldende Firma. Keine
        Rechtsberatung, keine automatische Fristenberechnung und keine automatische Bauablaufsperre –
        reine strukturierte Dokumentation dessen, was bisher per E-Mail oder Fax erledigt wurde.
      </p>
    </div>
  )
}
