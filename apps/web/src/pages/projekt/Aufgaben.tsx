import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil, pillStil } from '../stil'

type Aufgabe = {
  id: string
  titel: string
  status: 'offen' | 'in_bearbeitung' | 'erledigt'
  faellig_am: string | null
  gewerk: string | null
  zugewiesen_an: string | null
  profile: ProfilMini
}

type Gewerk = { id: string; name: string }
type Standardaufgabe = { id: string; titel: string }
type Abhaengigkeit = { id: string; vorgaenger_id: string; nachfolger_id: string }
type ProfilMini = { vollname: string } | { vollname: string }[] | null
type Verschiebung = {
  id: string
  aufgabe_id: string
  grund: string
  alter_termin: string | null
  neuer_termin: string | null
  erstellt_am: string
  profile: ProfilMini
}

const GRUND_LABEL: Record<string, string> = {
  krankheit: 'Krankheit',
  lieferverzug: 'Lieferverzug',
  wetter: 'Wetter',
  folgeverschiebung: 'Folge einer anderen Verschiebung',
  sonstiges: 'Sonstiges',
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function vollname(p: ProfilMini) {
  return Array.isArray(p) ? p[0]?.vollname ?? null : p?.vollname ?? null
}
function tageAddieren(iso: string, tage: number) {
  const d = new Date(iso)
  d.setDate(d.getDate() + tage)
  return d.toISOString().slice(0, 10)
}
function tageDifferenz(vonIso: string, bisIso: string) {
  return Math.round((new Date(bisIso).getTime() - new Date(vonIso).getTime()) / 86400000)
}

// Aufgaben je Projekt (Konzept Abschnitt 8.1). Erweitert um einfache
// Gewerke-Abhängigkeiten und ein Terminverschiebungs-Protokoll (Abschnitt
// 8.8/6, "Störungen & Abweichungen") - bisher listete diese Seite Termine
// nur flach ohne jede Beziehung zueinander.
export default function Aufgaben({ projektId, istEigentuemer }: { projektId: string; istEigentuemer: boolean }) {
  const { session, aktivFirma } = useAuth()
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [abhaengigkeiten, setAbhaengigkeiten] = useState<Abhaengigkeit[]>([])
  const [verschiebungen, setVerschiebungen] = useState<Verschiebung[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [gewerkId, setGewerkId] = useState('')
  const [standardaufgaben, setStandardaufgaben] = useState<Standardaufgabe[]>([])
  const [ausgewaehlteIds, setAusgewaehlteIds] = useState<Set<string>>(new Set())
  const [titel, setTitel] = useState('')
  const [faelligAm, setFaelligAm] = useState('')
  const [speichert, setSpeichert] = useState(false)

  const [offeneAufgabeId, setOffeneAufgabeId] = useState<string | null>(null)
  const [neueVorgaengerId, setNeueVorgaengerId] = useState('')
  const [verschiebungsGrund, setVerschiebungsGrund] = useState<Record<string, string>>({})
  const [vorschlag, setVorschlag] = useState<{ ursprung: Aufgabe; deltaTage: number; betroffene: Aufgabe[] } | null>(null)
  const [zuweisbarePersonen, setZuweisbarePersonen] = useState<{ id: string; name: string }[]>([])

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: aData, error }, { data: abData }, { data: vData }] = await Promise.all([
      supabase.from('aufgaben').select('id, titel, status, faellig_am, gewerk, zugewiesen_an, profile(vollname)').eq('projekt_id', projektId).order('faellig_am', { ascending: true, nullsFirst: false }),
      supabase.from('aufgaben_abhaengigkeiten').select('id, vorgaenger_id, nachfolger_id').eq('projekt_id', projektId),
      supabase.from('terminverschiebungen').select('id, aufgabe_id, grund, alter_termin, neuer_termin, erstellt_am, profile(vollname)').eq('projekt_id', projektId).order('erstellt_am', { ascending: false }),
    ])
    if (error) { setLadeStatus('fehler'); return }
    setAufgaben((aData ?? []) as unknown as Aufgabe[])
    setAbhaengigkeiten((abData ?? []) as Abhaengigkeit[])
    setVerschiebungen((vData ?? []) as unknown as Verschiebung[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  useEffect(() => {
    supabase.from('gewerke').select('id, name').order('sortierung').then(({ data }) => setGewerke(data ?? []))
  }, [])

  useEffect(() => {
    if (!aktivFirma) { setZuweisbarePersonen([]); return }
    supabase
      .from('firma_mitglieder')
      .select('nutzer_id, profile(vollname)')
      .eq('firma_id', aktivFirma.id)
      .then(({ data }) => {
        const personen = ((data ?? []) as unknown as { nutzer_id: string | null; profile: ProfilMini }[])
          .filter((r): r is { nutzer_id: string; profile: ProfilMini } => !!r.nutzer_id)
          .map((r) => ({ id: r.nutzer_id, name: vollname(r.profile) ?? 'Unbenannt' }))
          .sort((a, b) => a.name.localeCompare(b.name))
        setZuweisbarePersonen(personen)
      })
  }, [aktivFirma?.id])

  useEffect(() => {
    if (!gewerkId) { setStandardaufgaben([]); setAusgewaehlteIds(new Set()); return }
    supabase
      .from('gewerk_standardaufgaben')
      .select('id, titel')
      .eq('gewerk_id', gewerkId)
      .order('sortierung')
      .then(({ data }) => {
        setStandardaufgaben(data ?? [])
        setAusgewaehlteIds(new Set())
      })
  }, [gewerkId])

  const gewerkName = useMemo(() => gewerke.find((g) => g.id === gewerkId)?.name ?? null, [gewerke, gewerkId])

  function toggleAusgewaehlt(id: string) {
    setAusgewaehlteIds((vorherig) => {
      const neu = new Set(vorherig)
      neu.has(id) ? neu.delete(id) : neu.add(id)
      return neu
    })
  }

  function formularZuruecksetzen() {
    setGewerkId(''); setStandardaufgaben([]); setAusgewaehlteIds(new Set())
    setTitel(''); setFaelligAm('')
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const zeilen: { projekt_id: string; titel: string; gewerk: string | null; faellig_am: string | null }[] = []
    for (const sa of standardaufgaben) {
      if (ausgewaehlteIds.has(sa.id)) {
        zeilen.push({ projekt_id: projektId, titel: sa.titel, gewerk: gewerkName, faellig_am: faelligAm || null })
      }
    }
    if (titel.trim()) {
      zeilen.push({ projekt_id: projektId, titel: titel.trim(), gewerk: gewerkName, faellig_am: faelligAm || null })
    }
    if (zeilen.length === 0) return

    setSpeichert(true)
    const { error } = await supabase.from('aufgaben').insert(zeilen)
    setSpeichert(false)
    if (!error) {
      formularZuruecksetzen()
      setZeigeFormular(false)
      laden()
    }
  }

  async function toggleErledigt(a: Aufgabe) {
    const neuerStatus = a.status === 'erledigt' ? 'offen' : 'erledigt'
    await supabase.from('aufgaben').update({ status: neuerStatus }).eq('id', a.id)
    laden()
  }

  async function zuweisen(a: Aufgabe, personId: string) {
    await supabase.from('aufgaben').update({ zugewiesen_an: personId || null }).eq('id', a.id)
    laden()
  }

  // Vorgänger dieser Aufgabe (wovon sie abhängt) bzw. Nachfolger (was von
  // ihr abhängt) - client-seitig aus der bereits geladenen Kantenliste.
  function vorgaengerVon(aufgabeId: string) {
    return abhaengigkeiten.filter((k) => k.nachfolger_id === aufgabeId).map((k) => ({ kante: k, aufgabe: aufgaben.find((a) => a.id === k.vorgaenger_id) }))
  }
  function nachfolgerVon(aufgabeId: string) {
    return abhaengigkeiten.filter((k) => k.vorgaenger_id === aufgabeId).map((k) => aufgaben.find((a) => a.id === k.nachfolger_id)).filter((a): a is Aufgabe => !!a)
  }

  async function abhaengigkeitHinzufuegen(nachfolgerId: string) {
    if (!neueVorgaengerId) return
    await supabase.from('aufgaben_abhaengigkeiten').insert({ projekt_id: projektId, vorgaenger_id: neueVorgaengerId, nachfolger_id: nachfolgerId })
    setNeueVorgaengerId('')
    laden()
  }
  async function abhaengigkeitEntfernen(kantenId: string) {
    await supabase.from('aufgaben_abhaengigkeiten').delete().eq('id', kantenId)
    laden()
  }

  async function terminAendern(a: Aufgabe, neuesDatum: string) {
    const altesDatum = a.faellig_am
    await supabase.from('aufgaben').update({ faellig_am: neuesDatum || null }).eq('id', a.id)

    if (altesDatum && neuesDatum && altesDatum !== neuesDatum) {
      await supabase.from('terminverschiebungen').insert({
        projekt_id: projektId,
        aufgabe_id: a.id,
        grund: verschiebungsGrund[a.id] || 'sonstiges',
        alter_termin: altesDatum,
        neuer_termin: neuesDatum,
        gemeldet_von: session?.user?.id ?? null,
      })
      const betroffene = nachfolgerVon(a.id)
      if (betroffene.length > 0) {
        setVorschlag({ ursprung: { ...a, faellig_am: neuesDatum }, deltaTage: tageDifferenz(altesDatum, neuesDatum), betroffene })
      }
    }
    await laden()
  }

  async function vorschlagUebernehmen(betroffeneAufgabe: Aufgabe) {
    const neuesDatum = betroffeneAufgabe.faellig_am ? tageAddieren(betroffeneAufgabe.faellig_am, vorschlag!.deltaTage) : vorschlag!.ursprung.faellig_am!
    await supabase.from('aufgaben').update({ faellig_am: neuesDatum }).eq('id', betroffeneAufgabe.id)
    await supabase.from('terminverschiebungen').insert({
      projekt_id: projektId,
      aufgabe_id: betroffeneAufgabe.id,
      grund: 'folgeverschiebung',
      alter_termin: betroffeneAufgabe.faellig_am,
      neuer_termin: neuesDatum,
      kommentar: `Folge der Verschiebung von „${vorschlag!.ursprung.titel}"`,
      gemeldet_von: session?.user?.id ?? null,
    })
    setVorschlag((prev) => (prev ? { ...prev, betroffene: prev.betroffene.filter((b) => b.id !== betroffeneAufgabe.id) } : null))
    laden()
  }

  const anzahlAusgewaehlt = ausgewaehlteIds.size
  const anzahlGesamt = anzahlAusgewaehlt + (titel.trim() ? 1 : 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Aufgabe'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 220px' }}>
              Gewerk
              <select style={eingabeStil} value={gewerkId} onChange={(e) => setGewerkId(e.target.value)}>
                <option value="">– kein Gewerk –</option>
                {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 200px' }}>
              Fällig am (optional, gilt für alle hier angelegten Aufgaben)
              <input type="date" style={eingabeStil} value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
            </label>
          </div>

          {gewerkId && standardaufgaben.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 6 }}>
                Aus Standard-Checkliste übernehmen{anzahlAusgewaehlt > 0 ? ` (${anzahlAusgewaehlt} ausgewählt)` : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(40,28,14,.03)', borderRadius: 10, padding: 10 }}>
                {standardaufgaben.map((a) => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={ausgewaehlteIds.has(a.id)} onChange={() => toggleAusgewaehlt(a.id)} />
                    {a.titel}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            {gewerkId ? 'Zusätzliche eigene Aufgabe (optional)' : 'Titel'}
            <input style={eingabeStil} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z.B. Baustelle einrichten" />
          </label>

          <button type="submit" style={knopfStil} disabled={speichert || anzahlGesamt === 0}>
            {speichert ? 'Speichert …' : anzahlGesamt > 1 ? `${anzahlGesamt} Aufgaben anlegen` : 'Aufgabe speichern'}
          </button>
        </form>
      )}

      {vorschlag && vorschlag.betroffene.length > 0 && (
        <div style={{ ...karteStil, marginBottom: 16, borderColor: 'var(--orange)' }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-dim)' }}>
            „{vorschlag.ursprung.titel}" wurde auf {formatDatum(vorschlag.ursprung.faellig_am!)} verschoben
            ({vorschlag.deltaTage > 0 ? '+' : ''}{vorschlag.deltaTage} Tage). Diese Aufgaben hängen direkt davon ab:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vorschlag.betroffene.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,.4)' }}>
                <span style={{ fontSize: 12.5 }}>
                  {b.titel}{' '}
                  <span style={{ color: 'var(--ink-faint)' }}>
                    {b.faellig_am ? `${formatDatum(b.faellig_am)} → ${formatDatum(tageAddieren(b.faellig_am, vorschlag.deltaTage))}` : `→ ${formatDatum(vorschlag.ursprung.faellig_am!)}`}
                  </span>
                </span>
                <button style={knopfSekundaerStil} onClick={() => vorschlagUebernehmen(b)}>Termin übernehmen</button>
              </div>
            ))}
          </div>
          <button style={{ ...knopfSekundaerStil, marginTop: 10, fontSize: 11.5 }} onClick={() => setVorschlag(null)}>Schließen</button>
        </div>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Aufgaben …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Aufgaben konnten nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && aufgaben.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Noch keine Aufgaben.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {aufgaben.map((a) => {
          const offen = offeneAufgabeId === a.id
          const vorgaenger = vorgaengerVon(a.id)
          const nachfolger = nachfolgerVon(a.id)
          const eigeneVerschiebungen = verschiebungen.filter((v) => v.aufgabe_id === a.id).slice(0, 4)
          const andereAufgaben = aufgaben.filter((x) => x.id !== a.id && !vorgaenger.some((v) => v.aufgabe?.id === x.id))
          return (
            <div key={a.id} style={karteStil}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                  <input type="checkbox" checked={a.status === 'erledigt'} onChange={() => toggleErledigt(a)} />
                  <span
                    style={{
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      textDecoration: a.status === 'erledigt' ? 'line-through' : 'none',
                      color: a.status === 'erledigt' ? 'var(--ink-faint)' : 'var(--ink)',
                    }}
                  >
                    {a.titel}
                  </span>
                </label>
                {a.gewerk && <span style={pillStil('neutral')}>{a.gewerk}</span>}
                {vollname(a.profile) && <span style={pillStil('neutral')} title="Zugewiesen an">👤 {vollname(a.profile)}</span>}
                {vorgaenger.length > 0 && <span style={pillStil('warn')} title="Hängt von anderen Aufgaben ab">⛓ {vorgaenger.length}</span>}
                {a.faellig_am && (
                  <span style={{ fontSize: 12, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                    {formatDatum(a.faellig_am)}
                  </span>
                )}
                <button
                  onClick={() => setOffeneAufgabeId(offen ? null : a.id)}
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--ink-faint)', padding: '2px 6px' }}
                >
                  {offen ? '▲' : '▼'}
                </button>
              </div>

              {offen && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)' }}>
                      Fälligkeitsdatum
                      <input type="date" style={eingabeStil} value={a.faellig_am ?? ''} onChange={(e) => terminAendern(a, e.target.value)} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)' }}>
                      Zugewiesen an
                      <select style={eingabeStil} value={a.zugewiesen_an ?? ''} onChange={(e) => zuweisen(a, e.target.value)}>
                        <option value="">– niemand –</option>
                        {zuweisbarePersonen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-dim)' }}>
                      Grund bei Verschiebung
                      <select
                        style={eingabeStil}
                        value={verschiebungsGrund[a.id] ?? 'sonstiges'}
                        onChange={(e) => setVerschiebungsGrund((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      >
                        {Object.entries(GRUND_LABEL).filter(([k]) => k !== 'folgeverschiebung').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                      Hängt ab von
                    </div>
                    {vorgaenger.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>Keine Abhängigkeit.</p>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: istEigentuemer ? 8 : 0 }}>
                      {vorgaenger.map(({ kante, aufgabe }) => (
                        <span key={kante.id} style={{ ...pillStil('neutral'), display: 'flex', alignItems: 'center', gap: 6 }}>
                          {aufgabe?.titel ?? 'Unbekannte Aufgabe'}
                          {istEigentuemer && (
                            <button onClick={() => abhaengigkeitEntfernen(kante.id)} style={{ all: 'unset', cursor: 'pointer' }}>×</button>
                          )}
                        </span>
                      ))}
                    </div>
                    {istEigentuemer && andereAufgaben.length > 0 && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select style={{ ...eingabeStil, flex: 1 }} value={neueVorgaengerId} onChange={(e) => setNeueVorgaengerId(e.target.value)}>
                          <option value="">Aufgabe auswählen …</option>
                          {andereAufgaben.map((x) => <option key={x.id} value={x.id}>{x.titel}</option>)}
                        </select>
                        <button style={knopfSekundaerStil} onClick={() => abhaengigkeitHinzufuegen(a.id)} disabled={!neueVorgaengerId}>
                          + Abhängigkeit
                        </button>
                      </div>
                    )}
                  </div>

                  {nachfolger.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                        Blockiert (hängt davon ab)
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {nachfolger.map((n) => <span key={n.id} style={pillStil('neutral')}>{n.titel}</span>)}
                      </div>
                    </div>
                  )}

                  {eigeneVerschiebungen.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                        Verlauf
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {eigeneVerschiebungen.map((v) => (
                          <p key={v.id} style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-faint)' }}>
                            {v.alter_termin ? formatDatum(v.alter_termin) : '–'} → {v.neuer_termin ? formatDatum(v.neuer_termin) : '–'} ·{' '}
                            {GRUND_LABEL[v.grund] ?? v.grund}{vollname(v.profile) ? ` · ${vollname(v.profile)}` : ''}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="footnote">
        Abhängigkeiten sind eine einfache „Ende vor Start"-Beziehung, kein kritischer Pfad und kein
        automatisches Neuberechnen des gesamten Zeitplans – beim Verschieben eines Termins wird nur
        vorgeschlagen, direkt abhängige Folgeaufgaben ebenfalls zu verschieben, übernommen wird nichts
        automatisch. Jede Terminänderung einer bereits terminierten Aufgabe wird mit Grund im Verlauf
        protokolliert. Eine Aufgabe lässt sich zusätzlich einer Person aus der eigenen aktiven Firma
        zuweisen (Auswahlliste „Zugewiesen an") – die eigene, projektübergreifende Aufgabenliste findet
        sich im Zeitplan unter „Nur meine Aufgaben". Die Zuweisung ändert nichts daran, wer eine Aufgabe
        sehen oder bearbeiten darf.
      </p>
    </div>
  )
}
