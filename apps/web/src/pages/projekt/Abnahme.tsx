import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil, pillStil } from '../stil'

type Ergebnis = 'mangelfrei' | 'mit_maengeln' | 'verweigert'

type Abnahme = {
  id: string
  datum: string
  ergebnis: Ergebnis
  teilnehmer: string | null
  notizen: string | null
  erstellt_am: string
  bestaetigt_von_name: string | null
}

type RestMangel = { id: string; abnahme_id: string; titel: string; status: string; frist: string | null }

const ergebnisLabel: Record<Ergebnis, string> = {
  mangelfrei: 'Mängelfrei abgenommen',
  mit_maengeln: 'Mit Restmängeln abgenommen',
  verweigert: 'Abnahme verweigert',
}

const ergebnisVariante: Record<Ergebnis, 'ok' | 'warn' | 'bad'> = {
  mangelfrei: 'ok',
  mit_maengeln: 'warn',
  verweigert: 'bad',
}

// Digitales Abnahmeprotokoll (Kern-Workflow Schritt 5, zwischen
// Projektdurchführung und Rechnung/Zahlung). Bewusst eine einfache digitale
// Bestätigung (Name + Zeitstempel der angemeldeten Person beim Speichern),
// keine kryptografische/rechtsverbindliche elektronische Signatur - dafür
// bräuchte es einen eigenen Signatur-Dienst.
export default function Abnahme({ projektId }: { projektId: string }) {
  const [abnahmen, setAbnahmen] = useState<Abnahme[]>([])
  const [restmaengel, setRestmaengel] = useState<RestMangel[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [speichert, setSpeichert] = useState(false)

  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10))
  const [ergebnis, setErgebnis] = useState<Ergebnis>('mangelfrei')
  const [teilnehmer, setTeilnehmer] = useState('')
  const [notizen, setNotizen] = useState('')
  const [restmangelZeilen, setRestmangelZeilen] = useState<{ titel: string; frist: string }[]>([{ titel: '', frist: '' }])

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('abnahmen')
      .select('id, datum, ergebnis, teilnehmer, notizen, erstellt_am, profile(vollname)')
      .eq('projekt_id', projektId)
      .order('datum', { ascending: false })

    if (error) { setLadeStatus('fehler'); return }
    const liste = ((data ?? []) as unknown as Array<Omit<Abnahme, 'bestaetigt_von_name'> & { profile: { vollname: string } | { vollname: string }[] | null }>)
      .map((a) => ({ ...a, bestaetigt_von_name: Array.isArray(a.profile) ? a.profile[0]?.vollname ?? null : a.profile?.vollname ?? null }))
    setAbnahmen(liste)

    const ids = liste.map((a) => a.id)
    if (ids.length > 0) {
      const { data: maengelDaten } = await supabase
        .from('maengel')
        .select('id, abnahme_id, titel, status, frist')
        .in('abnahme_id', ids)
      setRestmaengel((maengelDaten ?? []) as RestMangel[])
    } else {
      setRestmaengel([])
    }
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  function restmangelZeileAendern(index: number, feld: 'titel' | 'frist', wert: string) {
    setRestmangelZeilen((zeilen) => zeilen.map((z, i) => (i === index ? { ...z, [feld]: wert } : z)))
  }

  function restmangelZeileHinzufuegen() {
    setRestmangelZeilen((zeilen) => [...zeilen, { titel: '', frist: '' }])
  }

  function restmangelZeileEntfernen(index: number) {
    setRestmangelZeilen((zeilen) => zeilen.filter((_, i) => i !== index))
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    setSpeichert(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: neueAbnahme, error } = await supabase
      .from('abnahmen')
      .insert({
        projekt_id: projektId,
        datum,
        ergebnis,
        teilnehmer: teilnehmer || null,
        notizen: notizen || null,
        bestaetigt_von: user?.id,
      })
      .select('id')
      .single()

    if (!error && neueAbnahme) {
      const gueltigeZeilen = restmangelZeilen.filter((z) => z.titel.trim())
      if (ergebnis !== 'mangelfrei' && gueltigeZeilen.length > 0) {
        await supabase.from('maengel').insert(
          gueltigeZeilen.map((z) => ({
            projekt_id: projektId,
            titel: z.titel.trim(),
            frist: z.frist || null,
            gemeldet_von: user?.id,
            abnahme_id: neueAbnahme.id,
          }))
        )
      }
      setDatum(new Date().toISOString().slice(0, 10))
      setErgebnis('mangelfrei')
      setTeilnehmer('')
      setNotizen('')
      setRestmangelZeilen([{ titel: '', frist: '' }])
      setZeigeFormular(false)
      laden()
    }
    setSpeichert(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)', maxWidth: 480 }}>
          Digitales Abnahmeprotokoll: Ergebnis, Teilnehmer:innen und Restmängel mit Frist festhalten, statt es formlos
          im Gespräch zu belassen. Restmängel landen automatisch auch in der normalen Mängelliste.
        </p>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Abnahme protokollieren'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Datum
              <input type="date" style={eingabeStil} value={datum} onChange={(e) => setDatum(e.target.value)} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 220px' }}>
              Ergebnis
              <select style={eingabeStil} value={ergebnis} onChange={(e) => setErgebnis(e.target.value as Ergebnis)}>
                {(Object.entries(ergebnisLabel) as [Ergebnis, string][]).map(([wert, label]) => (
                  <option key={wert} value={wert}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Teilnehmer:innen (optional)
            <input
              style={eingabeStil}
              value={teilnehmer}
              onChange={(e) => setTeilnehmer(e.target.value)}
              placeholder="z. B. Bauherr Max Mustermann, Polier Firma XY"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Notizen (optional)
            <textarea
              style={{ ...eingabeStil, minHeight: 60, fontFamily: 'inherit' }}
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
            />
          </label>

          {ergebnis !== 'mangelfrei' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-dim)', fontWeight: 600 }}>Restmängel</span>
              {restmangelZeilen.map((zeile, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...eingabeStil, flex: 2 }}
                    placeholder="Titel des Restmangels"
                    value={zeile.titel}
                    onChange={(e) => restmangelZeileAendern(i, 'titel', e.target.value)}
                  />
                  <input
                    type="date"
                    style={{ ...eingabeStil, flex: 1 }}
                    value={zeile.frist}
                    onChange={(e) => restmangelZeileAendern(i, 'frist', e.target.value)}
                  />
                  {restmangelZeilen.length > 1 && (
                    <button
                      type="button"
                      onClick={() => restmangelZeileEntfernen(i)}
                      style={{ all: 'unset', cursor: 'pointer', fontSize: 16, color: 'var(--ink-faint)', padding: '0 4px' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={restmangelZeileHinzufuegen} style={{ ...knopfSekundaerStil, alignSelf: 'flex-start', padding: '5px 12px', fontSize: 12.5 }}>
                + Weiterer Restmangel
              </button>
            </div>
          )}

          <button type="submit" style={knopfStil} disabled={speichert}>
            {speichert ? 'Speichert …' : 'Abnahme bestätigen und speichern'}
          </button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Abnahmen konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && abnahmen.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Abnahme protokolliert.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {abnahmen.map((a) => {
          const zugehoerigeRestmaengel = restmaengel.filter((m) => m.abnahme_id === a.id)
          return (
            <div key={a.id} style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {new Date(a.datum).toLocaleDateString('de-DE')}
                </span>
                <span style={pillStil(ergebnisVariante[a.ergebnis])}>{ergebnisLabel[a.ergebnis]}</span>
              </div>
              {a.teilnehmer && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-dim)' }}>Teilnehmer:innen: {a.teilnehmer}</p>}
              {a.notizen && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-dim)' }}>{a.notizen}</p>}
              {zugehoerigeRestmaengel.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)' }}>
                    Restmängel
                  </span>
                  {zugehoerigeRestmaengel.map((m) => (
                    <span key={m.id} style={{ fontSize: 12.5 }}>
                      · {m.titel}{m.frist ? ` (Frist: ${new Date(m.frist).toLocaleDateString('de-DE')})` : ''} – {m.status}
                    </span>
                  ))}
                </div>
              )}
              <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
                Bestätigt von {a.bestaetigt_von_name ?? 'Unbekannt'} am {new Date(a.erstellt_am).toLocaleDateString('de-DE')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
