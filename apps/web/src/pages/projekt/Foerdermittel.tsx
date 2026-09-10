import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { karteStil, knopfStil, pillStil } from '../stil'

// Regelbasierte, unverbindliche Fördermittel-Ersteinschätzung (Konzept
// Abschnitt 8.11/10/17). Bewusst KEINE KI, KEINE Förderzusage und KEINE
// exakte Fördersummen-Berechnung - nur ein Abgleich "welche Programme
// kommen anhand der geplanten Maßnahmen grundsätzlich in Frage". Programme,
// Sätze und Voraussetzungen ändern sich häufig (siehe Konzept Abschnitt 17),
// deshalb immer mit Datum der Recherche kennzeichnen und auf die offiziellen
// Stellen verweisen statt eigene Zahlen als verbindlich darzustellen.

type MassnahmeKey =
  | 'heizungstausch'
  | 'daemmung'
  | 'fenster_tueren'
  | 'lueftung'
  | 'energieberatung'
  | 'barrierereduzierung'
  | 'neubau_effizienzhaus'
  | 'bestandserwerb_jung_kauft_alt'
  | 'erneuerbare_energien'

const massnahmenKatalog: { key: MassnahmeKey; label: string }[] = [
  { key: 'heizungstausch', label: 'Heizungstausch (z. B. Wärmepumpe, Biomasse, Fernwärme)' },
  { key: 'daemmung', label: 'Dämmung (Fassade, Dach, oberste Geschossdecke)' },
  { key: 'fenster_tueren', label: 'Fenster- oder Türentausch' },
  { key: 'lueftung', label: 'Lüftungsanlage mit Wärmerückgewinnung' },
  { key: 'energieberatung', label: 'Energieberatung / individueller Sanierungsfahrplan (iSFP) gewünscht' },
  { key: 'barrierereduzierung', label: 'Barrierereduzierung / altersgerechter Umbau' },
  { key: 'neubau_effizienzhaus', label: 'Neubau nach Effizienzhaus-Standard' },
  { key: 'bestandserwerb_jung_kauft_alt', label: 'Bestandskauf mit anschließender Sanierung (z. B. junge Familie)' },
  { key: 'erneuerbare_energien', label: 'Photovoltaik, Batteriespeicher oder weitere erneuerbare Energien' },
]

type Programm = { name: string; traeger: 'KfW' | 'BAFA'; art: string; beschreibung: string; link: string }

const programme: Record<string, Programm> = {
  kfw458: {
    name: 'KfW 458 – Heizungsförderung',
    traeger: 'KfW',
    art: 'Zuschuss',
    beschreibung: 'Zuschuss für den Tausch alter Heizungen gegen klimafreundliche Systeme (Wärmepumpe, Biomasse, Solarthermie, Fernwärme).',
    link: 'https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestehende-Immobilie/F%C3%B6rderprodukte/Heizungsf%C3%B6rderung-f%C3%BCr-Privatpersonen-Wohngeb%C3%A4ude-(458)/',
  },
  bafa_em: {
    name: 'BAFA BEG Einzelmaßnahmen (EM)',
    traeger: 'BAFA',
    art: 'Zuschuss',
    beschreibung: 'Zuschuss für einzelne Sanierungsmaßnahmen an der Gebäudehülle (Dämmung, Fenster, Türen) und Anlagentechnik wie Lüftung.',
    link: 'https://www.bafa.de/DE/Energie/Effiziente_Gebaeude/Sanierung_Wohngebaeude/sanierung_wohngebaeude_node.html',
  },
  kfw261: {
    name: 'KfW 261 – Wohngebäude Kredit',
    traeger: 'KfW',
    art: 'Kredit + Tilgungszuschuss',
    beschreibung: 'Zinsgünstiger Kredit mit Tilgungszuschuss für die umfassende Sanierung zum KfW-Effizienzhaus statt einzelner Maßnahmen.',
    link: 'https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestehende-Immobilie/F%C3%B6rderprodukte/Wohngeb%C3%A4ude-Kredit-(261-262)/',
  },
  bafa_beratung: {
    name: 'BAFA Energieberatung (iSFP)',
    traeger: 'BAFA',
    art: 'Zuschuss',
    beschreibung: 'Zuschuss zum Honorar eines Energieberaters für einen individuellen Sanierungsfahrplan – oft Voraussetzung für Boni bei anderen Programmen.',
    link: 'https://www.bafa.de/DE/Energie/Energieberatung/energieberatung_node.html',
  },
  kfw159: {
    name: 'KfW 159 – Altersgerecht Umbauen',
    traeger: 'KfW',
    art: 'Kredit',
    beschreibung: 'Günstiger Kredit für den barrierereduzierenden Umbau von Wohnraum.',
    link: 'https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestehende-Immobilie/F%C3%B6rderprodukte/Altersgerecht-Umbauen-Kredit-(159)/',
  },
  kfw297: {
    name: 'KfW 297/298 – Klimafreundlicher Neubau',
    traeger: 'KfW',
    art: 'Kredit',
    beschreibung: 'Zinsgünstiger Kredit für Neubauten, die den Effizienzhaus-40-Standard (mit Nachhaltigkeitsklasse) erreichen.',
    link: 'https://www.kfw.de/inlandsfoerderung/Privatpersonen/Neubau/F%C3%B6rderprodukte/Klimafreundlicher-Neubau-Wohngeb%C3%A4ude-(297-298)/',
  },
  kfw308: {
    name: 'KfW 308 – Jung kauft Alt',
    traeger: 'KfW',
    art: 'Kredit',
    beschreibung: 'Zinsgünstiger Kredit für Familien mit Kindern, die eine sanierungsbedürftige Bestandsimmobilie kaufen und energetisch sanieren.',
    link: 'https://www.kfw.de/inlandsfoerderung/Privatpersonen/Neubau/F%C3%B6rderprodukte/Wohneigentum-f%C3%BCr-Familien-Bestandserwerb-(308)/',
  },
  kfw270: {
    name: 'KfW 270 – Erneuerbare Energien Standard',
    traeger: 'KfW',
    art: 'Kredit',
    beschreibung: 'Kredit zur Finanzierung von Photovoltaik-, Speicher- und weiteren Erneuerbare-Energien-Anlagen.',
    link: 'https://www.kfw.de/inlandsfoerderung/Privatpersonen/Bestehende-Immobilie/F%C3%B6rderprodukte/Erneuerbare-Energien-Standard-(270)/',
  },
}

const zuordnung: Record<MassnahmeKey, string[]> = {
  heizungstausch: ['kfw458'],
  daemmung: ['bafa_em', 'kfw261'],
  fenster_tueren: ['bafa_em', 'kfw261'],
  lueftung: ['bafa_em'],
  energieberatung: ['bafa_beratung'],
  barrierereduzierung: ['kfw159'],
  neubau_effizienzhaus: ['kfw297'],
  bestandserwerb_jung_kauft_alt: ['kfw308'],
  erneuerbare_energien: ['kfw270'],
}

function ergebnisBerechnen(ausgewaehlt: Set<MassnahmeKey>) {
  const keys = new Set<string>()
  ausgewaehlt.forEach((m) => (zuordnung[m] ?? []).forEach((p) => keys.add(p)))
  return Array.from(keys).map((key) => ({ key, ...programme[key] }))
}

type GespeicherteEinschaetzung = {
  id: string
  massnahmen: MassnahmeKey[]
  ergebnis: (Programm & { key: string })[]
  erstellt_am: string
}

export default function Foerdermittel({
  projektId,
  istEigentuemer,
  vorhabenart,
}: {
  projektId: string
  istEigentuemer: boolean
  vorhabenart: string | null
}) {
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<MassnahmeKey>>(new Set())
  const [letzte, setLetzte] = useState<GespeicherteEinschaetzung | null>(null)
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      setLadeStatus('laedt')
      const { data, error } = await supabase
        .from('foerdermittel_einschaetzungen')
        .select('id, massnahmen, ergebnis, erstellt_am')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (abgebrochen) return
      if (error) {
        setLadeStatus('fehler')
        return
      }
      if (data) {
        const eintrag = data as unknown as GespeicherteEinschaetzung
        setLetzte(eintrag)
        setAusgewaehlt(new Set(eintrag.massnahmen ?? []))
      } else if (vorhabenart === 'neubau') {
        setAusgewaehlt(new Set(['neubau_effizienzhaus']))
      }
      setLadeStatus('bereit')
    }
    laden()
    return () => { abgebrochen = true }
  }, [projektId, vorhabenart])

  function umschalten(key: MassnahmeKey) {
    setAusgewaehlt((prev) => {
      const naechste = new Set(prev)
      if (naechste.has(key)) naechste.delete(key)
      else naechste.add(key)
      return naechste
    })
  }

  const vorschau = useMemo(() => ergebnisBerechnen(ausgewaehlt), [ausgewaehlt])

  async function speichern() {
    setSpeichert(true)
    setFehler(null)
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('foerdermittel_einschaetzungen')
      .insert({
        projekt_id: projektId,
        massnahmen: Array.from(ausgewaehlt),
        ergebnis: vorschau,
        erstellt_von: userData.user?.id ?? null,
      })
      .select('id, massnahmen, ergebnis, erstellt_am')
      .single()
    setSpeichert(false)
    if (error || !data) {
      setFehler(`Speichern fehlgeschlagen: ${error?.message ?? 'unbekannter Fehler'}`)
      return
    }
    setLetzte(data as unknown as GespeicherteEinschaetzung)
  }

  const anzeigeErgebnis = letzte && setsGleich(new Set(letzte.massnahmen), ausgewaehlt) ? letzte.ergebnis : vorschau

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ ...karteStil, borderLeft: '3px solid var(--senf, #d9a62e)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Unverbindliche Ersteinschätzung – keine Förderzusage</div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
          Dieser Abgleich zeigt anhand der angehakten Maßnahmen, welche KfW-/BAFA-Programme grundsätzlich infrage
          kommen könnten (Stand unserer Recherche: September 2026). Fördersätze, Bedingungen und Programme ändern
          sich häufig – prüfe vor jeder Antragstellung die aktuellen Angaben auf{' '}
          <a href="https://www.kfw.de" target="_blank" rel="noreferrer">kfw.de</a> bzw.{' '}
          <a href="https://www.bafa.de" target="_blank" rel="noreferrer">bafa.de</a> oder mit einem Energieberater.
          Diese Einschätzung ersetzt keine förderrechtliche oder steuerliche Beratung.
        </p>
      </div>

      <div style={karteStil}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: '0 0 12px' }}>Geplante Maßnahmen</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {massnahmenKatalog.map((m) => (
            <label key={m.key} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, cursor: istEigentuemer ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                checked={ausgewaehlt.has(m.key)}
                disabled={!istEigentuemer}
                onChange={() => umschalten(m.key)}
              />
              {m.label}
            </label>
          ))}
        </div>
        {istEigentuemer && (
          <div style={{ marginTop: 14 }}>
            <button style={knopfStil} onClick={speichern} disabled={speichert}>
              {speichert ? 'Speichert …' : 'Ersteinschätzung speichern'}
            </button>
          </div>
        )}
        {fehler && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
      </div>

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Konnte nicht geladen werden.</p>}

      {ladeStatus === 'bereit' && (
        <div style={karteStil}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: 0 }}>Grundsätzlich infrage kommende Programme</h2>
            {letzte && <span style={pillStil('neutral')}>Zuletzt gespeichert: {new Date(letzte.erstellt_am).toLocaleDateString('de-DE')}</span>}
          </div>
          {anzeigeErgebnis.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
              Wähle mindestens eine Maßnahme aus, um eine Ersteinschätzung zu sehen.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {anzeigeErgebnis.map((p) => (
                <div key={p.key} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,.35)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}</span>
                    <span style={pillStil('neutral')}>{p.traeger} · {p.art}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{p.beschreibung}</p>
                  <a href={p.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--olive)' }}>
                    Offizielle Programmseite ↗
                  </a>
                </div>
              ))}
            </div>
          )}
          {!setsGleich(new Set(letzte?.massnahmen ?? []), ausgewaehlt) && anzeigeErgebnis.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-faint)' }}>
              Vorschau auf Basis der aktuellen Auswahl – noch nicht gespeichert.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function setsGleich(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
