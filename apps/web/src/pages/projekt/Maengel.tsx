import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil, pillStil } from '../stil'

type Mangel = {
  id: string
  titel: string
  beschreibung: string | null
  dringlichkeit: 'kritisch' | 'mittel' | 'gering'
  status: 'offen' | 'in_bearbeitung' | 'behoben' | 'abgenommen'
  zustaendiges_gewerk: string | null
  frist: string | null
  grundriss_x: number | null
  grundriss_y: number | null
  fotos: { url: string }[]
}

type Gewerk = { id: string; name: string }

const dringlichkeitFarbe: Record<Mangel['dringlichkeit'], string> = {
  kritisch: 'var(--red)',
  mittel: 'var(--orange-text)',
  gering: 'var(--ink-faint)',
}

const statusLabel: Record<Mangel['status'], string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  behoben: 'Behoben',
  abgenommen: 'Abgenommen',
}

// Foto + KI-Ersteinschätzung am Mangel (Konzept Abschnitt 8.1/10) - die
// web-taugliche Variante der "AR-Mängeleinschätzung" ohne AR-Kamera-Tracking
// (das bleibt laut Entscheidung vom 09.09.2026 der künftigen nativen
// Mobile-App vorbehalten, siehe Konzept Abschnitt 18). Ein Foto am Mangel
// hochladen und dazu eine unverbindliche KI-Ersteinschätzung anfordern,
// analog zum bestehenden Muster im Bautagebuch.
type MangelEinschaetzung = 'unkritisch' | 'beobachten' | 'fachkundig_pruefen_lassen'
type MangelFotoErgebnis = {
  vermutete_art: string
  einschaetzung: MangelEinschaetzung
  zusammenfassung: string
  empfehlung: string
}

const mangelEinschaetzungLabel: Record<MangelEinschaetzung, string> = {
  unkritisch: 'Unkritisch',
  beobachten: 'Beobachten',
  fachkundig_pruefen_lassen: 'Fachkundig prüfen lassen',
}
const mangelEinschaetzungFarbe: Record<MangelEinschaetzung, string> = {
  unkritisch: 'var(--ink-faint)',
  beobachten: 'var(--orange-text)',
  fachkundig_pruefen_lassen: 'var(--red)',
}

type Ansicht = 'liste' | 'grundriss'

// Mängelmanagement auf dem Grundriss (Konzept Abschnitt 8.1, Mockup
// "MaengelGrundriss"): grundriss_x/grundriss_y existieren als Spalten
// schon seit 0001_init.sql, wurden im Frontend aber bisher nirgends
// befüllt oder angezeigt - dieser Teil war noch reiner Platzhalter
// (siehe ModulPlatzhalter.tsx). Pins werden als Prozentwerte (0-100)
// relativ zur Grundriss-Bildgröße gespeichert, damit die Verortung
// unabhängig von der tatsächlichen Bildauflösung/Anzeigegröße bleibt.
export default function Maengel({ projektId, istEigentuemer }: { projektId: string; istEigentuemer: boolean }) {
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [dringlichkeit, setDringlichkeit] = useState<Mangel['dringlichkeit']>('mittel')
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [gewerkId, setGewerkId] = useState('')
  const [frist, setFrist] = useState('')
  const [fotoDateien, setFotoDateien] = useState<File[]>([])

  const [einschaetzungenByFoto, setEinschaetzungenByFoto] = useState<Map<string, MangelFotoErgebnis>>(new Map())
  const [ladendeFotos, setLadendeFotos] = useState<Set<string>>(new Set())
  const [hochladendeMangelIds, setHochladendeMangelIds] = useState<Set<string>>(new Set())
  const [einschaetzungFehler, setEinschaetzungFehler] = useState<string | null>(null)

  const [ansicht, setAnsicht] = useState<Ansicht>('liste')
  const [grundrissUrl, setGrundrissUrl] = useState<string | null>(null)
  const [grundrissLaedt, setGrundrissLaedt] = useState(false)
  const [platzierId, setPlatzierId] = useState<string | null>(null)
  const [klickPosition, setKlickPosition] = useState<{ x: number; y: number } | null>(null)
  const [neuTitel, setNeuTitel] = useState('')
  const [neuDringlichkeit, setNeuDringlichkeit] = useState<Mangel['dringlichkeit']>('mittel')
  const [ausgewaehlteId, setAusgewaehlteId] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('maengel')
      .select('id, titel, beschreibung, dringlichkeit, status, zustaendiges_gewerk, frist, grundriss_x, grundriss_y, fotos')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: false })

    if (error) { setLadeStatus('fehler'); return }
    const geladeneMaengel = (data ?? []) as Mangel[]
    setMaengel(geladeneMaengel)

    const mangelIds = geladeneMaengel.map((m) => m.id)
    if (mangelIds.length > 0) {
      const { data: einschaetzungenData } = await supabase
        .from('mangel_ki_einschaetzungen')
        .select('mangel_id, foto_url, ergebnis, erstellt_am')
        .in('mangel_id', mangelIds)
        .order('erstellt_am', { ascending: false })
      const neueMap = new Map<string, MangelFotoErgebnis>()
      for (const e of (einschaetzungenData ?? []) as Array<{ foto_url: string; ergebnis: MangelFotoErgebnis }>) {
        if (!neueMap.has(e.foto_url)) neueMap.set(e.foto_url, e.ergebnis)
      }
      setEinschaetzungenByFoto(neueMap)
    } else {
      setEinschaetzungenByFoto(new Map())
    }

    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  useEffect(() => {
    supabase.from('gewerke').select('id, name').order('sortierung').then(({ data }) => setGewerke(data ?? []))
  }, [])

  useEffect(() => {
    supabase.from('projekte').select('grundriss_url').eq('id', projektId).maybeSingle().then(({ data }) => {
      setGrundrissUrl((data as { grundriss_url: string | null } | null)?.grundriss_url ?? null)
    })
  }, [projektId])

  async function fotosHochladen(dateien: File[]): Promise<{ url: string }[]> {
    const hochgeladeneFotos: { url: string }[] = []
    for (const datei of dateien) {
      const endung = datei.name.split('.').pop() || 'jpg'
      const pfad = `${projektId}/${crypto.randomUUID()}.${endung}`
      const { error: uploadFehler } = await supabase.storage.from('maengel-fotos').upload(pfad, await datei.arrayBuffer(), {
        contentType: datei.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      })
      if (!uploadFehler) {
        hochgeladeneFotos.push({ url: supabase.storage.from('maengel-fotos').getPublicUrl(pfad).data.publicUrl })
      }
    }
    return hochgeladeneFotos
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    const hochgeladeneFotos = await fotosHochladen(fotoDateien)
    const { data: { user } } = await supabase.auth.getUser()
    const gewerkName = gewerke.find((g) => g.id === gewerkId)?.name ?? null
    const { error } = await supabase.from('maengel').insert({
      projekt_id: projektId,
      titel,
      beschreibung: beschreibung || null,
      dringlichkeit,
      zustaendiges_gewerk: gewerkName,
      frist: frist || null,
      gemeldet_von: user?.id,
      fotos: hochgeladeneFotos,
    })
    if (!error) {
      setTitel(''); setBeschreibung(''); setDringlichkeit('mittel'); setGewerkId(''); setFrist(''); setFotoDateien([])
      setZeigeFormular(false)
      laden()
    }
  }

  async function fotoZuMangelHinzufuegen(mangel: Mangel, datei: File) {
    setHochladendeMangelIds((v) => new Set(v).add(mangel.id))
    const [neuesFoto] = await fotosHochladen([datei])
    if (neuesFoto) {
      await supabase.from('maengel').update({ fotos: [...mangel.fotos, neuesFoto] }).eq('id', mangel.id)
      await laden()
    }
    setHochladendeMangelIds((v) => {
      const neu = new Set(v)
      neu.delete(mangel.id)
      return neu
    })
  }

  async function einschaetzungAnfordern(mangelId: string, fotoUrl: string) {
    setEinschaetzungFehler(null)
    setLadendeFotos((v) => new Set(v).add(fotoUrl))
    const { data, error } = await supabase.functions.invoke('foto-einschaetzung', {
      body: { mangelId, fotoUrl },
    })
    setLadendeFotos((v) => {
      const neu = new Set(v)
      neu.delete(fotoUrl)
      return neu
    })
    if (error || data?.fehler) {
      setEinschaetzungFehler('KI-Ersteinschätzung konnte nicht abgerufen werden.')
      return
    }
    setEinschaetzungenByFoto((v) => new Map(v).set(fotoUrl, data.ergebnis as MangelFotoErgebnis))
  }

  async function statusAendern(id: string, status: Mangel['status']) {
    await supabase.from('maengel').update({ status }).eq('id', id)
    laden()
  }

  async function grundrissHochladen(datei: File) {
    setGrundrissLaedt(true)
    const endung = datei.name.split('.').pop() || 'jpg'
    const pfad = `${projektId}/grundriss.${endung}`
    const { error: uploadFehler } = await supabase.storage.from('grundrisse').upload(pfad, await datei.arrayBuffer(), {
      contentType: datei.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: true,
    })
    if (!uploadFehler) {
      const basisUrl = supabase.storage.from('grundrisse').getPublicUrl(pfad).data.publicUrl
      const url = `${basisUrl}?v=${Date.now()}`
      await supabase.from('projekte').update({ grundriss_url: url }).eq('id', projektId)
      setGrundrissUrl(url)
    }
    setGrundrissLaedt(false)
  }

  function bildKlick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    if (platzierId) {
      positionSetzen(platzierId, x, y)
    } else {
      setAusgewaehlteId(null)
      setKlickPosition({ x, y })
    }
  }

  async function positionSetzen(id: string, x: number, y: number) {
    await supabase.from('maengel').update({ grundriss_x: x, grundriss_y: y }).eq('id', id)
    setPlatzierId(null)
    laden()
  }

  async function positionEntfernen(id: string) {
    await supabase.from('maengel').update({ grundriss_x: null, grundriss_y: null }).eq('id', id)
    setAusgewaehlteId(null)
    laden()
  }

  async function neuenPinAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!klickPosition || !neuTitel.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('maengel').insert({
      projekt_id: projektId,
      titel: neuTitel.trim(),
      dringlichkeit: neuDringlichkeit,
      grundriss_x: klickPosition.x,
      grundriss_y: klickPosition.y,
      gemeldet_von: user?.id,
    })
    setKlickPosition(null)
    setNeuTitel('')
    setNeuDringlichkeit('mittel')
    laden()
  }

  const unverortete = maengel.filter((m) => m.grundriss_x == null || m.grundriss_y == null)
  const ausgewaehlterMangel = maengel.find((m) => m.id === ausgewaehlteId) ?? null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={ansicht === 'liste' ? knopfStil : knopfSekundaerStil} onClick={() => setAnsicht('liste')}>Liste</button>
          <button style={ansicht === 'grundriss' ? knopfStil : knopfSekundaerStil} onClick={() => setAnsicht('grundriss')}>Grundriss</button>
        </div>
        {ansicht === 'liste' && (
          <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
            {zeigeFormular ? 'Abbrechen' : '+ Mangel melden'}
          </button>
        )}
      </div>

      {ansicht === 'liste' ? (
        <>
          {zeigeFormular && (
            <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
                Titel
                <input style={eingabeStil} value={titel} onChange={(e) => setTitel(e.target.value)} required />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
                Beschreibung (optional)
                <textarea
                  style={{ ...eingabeStil, minHeight: 60, fontFamily: 'inherit' }}
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                  Dringlichkeit
                  <select
                    style={eingabeStil}
                    value={dringlichkeit}
                    onChange={(e) => setDringlichkeit(e.target.value as Mangel['dringlichkeit'])}
                  >
                    <option value="kritisch">Kritisch</option>
                    <option value="mittel">Mittel</option>
                    <option value="gering">Gering</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 180px' }}>
                  Zuständiges Gewerk (optional)
                  <select style={eingabeStil} value={gewerkId} onChange={(e) => setGewerkId(e.target.value)}>
                    <option value="">– kein Gewerk –</option>
                    {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
                  Frist (optional)
                  <input type="date" style={eingabeStil} value={frist} onChange={(e) => setFrist(e.target.value)} />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
                Fotos (optional – dazu lässt sich später eine unverbindliche KI-Ersteinschätzung anfordern)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={eingabeStil}
                  onChange={(e) => setFotoDateien(Array.from(e.target.files ?? []))}
                />
              </label>
              <button type="submit" style={knopfStil}>Mangel speichern</button>
            </form>
          )}

          {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Mängel …</p>}
          {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Mängel konnten nicht geladen werden.</p>}
          {ladeStatus === 'bereit' && maengel.length === 0 && (
            <p style={{ color: 'var(--ink-faint)' }}>Keine Mängel gemeldet.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {maengel.map((m) => (
              <div key={m.id} style={{ ...karteStil, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{m.titel}</div>
                    {m.beschreibung && <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 4 }}>{m.beschreibung}</div>}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {m.zustaendiges_gewerk && <span style={pillStil('neutral')}>{m.zustaendiges_gewerk}</span>}
                      {m.frist && (
                        <span style={pillStil(m.status !== 'behoben' && m.status !== 'abgenommen' && m.frist < new Date().toISOString().slice(0, 10) ? 'bad' : 'neutral')}>
                          Frist {new Date(m.frist).toLocaleDateString('de-DE')}
                        </span>
                      )}
                      {m.grundriss_x == null && (
                        <button
                          style={{ ...pillStil('neutral'), border: '1px dashed var(--glass-border)', cursor: 'pointer' }}
                          onClick={() => { setPlatzierId(m.id); setAnsicht('grundriss') }}
                        >
                          Auf Grundriss verorten
                        </button>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: dringlichkeitFarbe[m.dringlichkeit], whiteSpace: 'nowrap' }}>
                    {m.dringlichkeit.toUpperCase()}
                  </span>
                </div>
                <select
                  value={m.status}
                  onChange={(e) => statusAendern(m.id, e.target.value as Mangel['status'])}
                  style={{ ...eingabeStil, marginTop: 10, fontSize: 12, padding: '4px 8px' }}
                >
                  {Object.entries(statusLabel).map(([wert, label]) => (
                    <option key={wert} value={wert}>{label}</option>
                  ))}
                </select>

                {m.fotos.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {m.fotos.map((foto) => {
                      const ergebnis = einschaetzungenByFoto.get(foto.url)
                      const laedt = ladendeFotos.has(foto.url)
                      return (
                        <div key={foto.url} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <img
                              src={foto.url}
                              alt="Mangelfoto"
                              style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, background: 'var(--surface)' }}
                            />
                            {!ergebnis && (
                              <button
                                type="button"
                                onClick={() => einschaetzungAnfordern(m.id, foto.url)}
                                disabled={laedt}
                                style={{ ...knopfStil, fontSize: 12, padding: '6px 10px', alignSelf: 'center' }}
                              >
                                {laedt ? 'Wird analysiert …' : '🤖 KI-Ersteinschätzung anfordern'}
                              </button>
                            )}
                          </div>
                          {ergebnis && (
                            <div style={{ ...karteStil, padding: '10px 14px', background: 'rgba(230,150,40,.06)', border: '1px solid rgba(230,150,40,.25)' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange-text)', marginBottom: 6 }}>
                                ⚠ Unverbindliche KI-Ersteinschätzung – keine fachliche/statische Bewertung, ersetzt keine Begutachtung vor Ort
                              </div>
                              {ergebnis.vermutete_art && (
                                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{ergebnis.vermutete_art}</div>
                              )}
                              {ergebnis.zusammenfassung && <div style={{ fontSize: 13, marginBottom: 4 }}>{ergebnis.zusammenfassung}</div>}
                              <div style={{ fontSize: 12.5, display: 'flex', gap: 6, marginBottom: ergebnis.empfehlung ? 4 : 0 }}>
                                <span style={{ color: mangelEinschaetzungFarbe[ergebnis.einschaetzung], fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  {mangelEinschaetzungLabel[ergebnis.einschaetzung]}:
                                </span>
                              </div>
                              {ergebnis.empfehlung && <div style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>{ergebnis.empfehlung}</div>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-faint)', marginTop: 10, cursor: 'pointer' }}>
                  {hochladendeMangelIds.has(m.id) ? 'Foto wird hochgeladen …' : '📷 Foto hinzufügen'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={hochladendeMangelIds.has(m.id)}
                    style={{ display: 'none' }}
                    onChange={(e) => { const d = e.target.files?.[0]; if (d) fotoZuMangelHinzufuegen(m, d) }}
                  />
                </label>
              </div>
            ))}
          </div>
          {einschaetzungFehler && <p style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 12 }}>{einschaetzungFehler}</p>}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!grundrissUrl ? (
            istEigentuemer ? (
              <div style={{ ...karteStil, textAlign: 'center' }}>
                <p style={{ margin: '0 0 12px', color: 'var(--ink-dim)', fontSize: 13.5 }}>
                  Noch kein Grundriss hinterlegt. Lade ein Bild hoch, um Mängel direkt auf dem Plan zu verorten.
                </p>
                <input
                  type="file"
                  accept="image/*"
                  disabled={grundrissLaedt}
                  onChange={(e) => { const d = e.target.files?.[0]; if (d) grundrissHochladen(d) }}
                />
                {grundrissLaedt && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-faint)' }}>Lädt hoch …</p>}
              </div>
            ) : (
              <p style={{ color: 'var(--ink-faint)' }}>Für dieses Projekt ist noch kein Grundriss hinterlegt.</p>
            )
          ) : (
            <>
              {platzierId && (
                <div style={{ ...karteStil, background: 'color-mix(in oklab, var(--orange) 12%, transparent)', fontSize: 13 }}>
                  Klicke auf die gewünschte Stelle im Grundriss, um „{maengel.find((m) => m.id === platzierId)?.titel}" zu verorten.
                  <button style={{ ...knopfSekundaerStil, marginLeft: 12, padding: '4px 12px', fontSize: 12 }} onClick={() => setPlatzierId(null)}>
                    Abbrechen
                  </button>
                </div>
              )}
              {!platzierId && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-faint)' }}>
                  Klicke auf eine freie Stelle, um dort einen neuen Mangel zu melden – oder auf einen vorhandenen Pin, um Details zu sehen.
                </p>
              )}
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', cursor: platzierId ? 'crosshair' : 'copy' }} onClick={bildKlick}>
                <img src={grundrissUrl} alt="Grundriss" style={{ maxWidth: '100%', display: 'block', borderRadius: 12, border: '1px solid var(--glass-border)' }} />
                {maengel.filter((m) => m.grundriss_x != null && m.grundriss_y != null).map((m) => (
                  <button
                    key={m.id}
                    title={m.titel}
                    onClick={(e) => { e.stopPropagation(); setKlickPosition(null); setAusgewaehlteId(m.id) }}
                    style={{
                      position: 'absolute',
                      left: `${m.grundriss_x}%`,
                      top: `${m.grundriss_y}%`,
                      transform: 'translate(-50%, -100%)',
                      width: 22,
                      height: 22,
                      borderRadius: '50% 50% 50% 0',
                      border: '2px solid white',
                      background: dringlichkeitFarbe[m.dringlichkeit],
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,.3)',
                      rotate: '-45deg',
                    }}
                  />
                ))}
              </div>

              {istEigentuemer && (
                <label style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  Grundriss ersetzen:{' '}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={grundrissLaedt}
                    onChange={(e) => { const d = e.target.files?.[0]; if (d) grundrissHochladen(d) }}
                  />
                </label>
              )}

              {klickPosition && !platzierId && (
                <form onSubmit={neuenPinAnlegen} style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Neuer Mangel an dieser Stelle</div>
                  <input style={eingabeStil} value={neuTitel} onChange={(e) => setNeuTitel(e.target.value)} placeholder="Titel, z. B. Riss in der Wand" required autoFocus />
                  <select style={eingabeStil} value={neuDringlichkeit} onChange={(e) => setNeuDringlichkeit(e.target.value as Mangel['dringlichkeit'])}>
                    <option value="kritisch">Kritisch</option>
                    <option value="mittel">Mittel</option>
                    <option value="gering">Gering</option>
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" style={knopfStil}>Speichern</button>
                    <button type="button" style={knopfSekundaerStil} onClick={() => setKlickPosition(null)}>Abbrechen</button>
                  </div>
                </form>
              )}

              {ausgewaehlterMangel && (
                <div style={{ ...karteStil, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{ausgewaehlterMangel.titel}</div>
                      {ausgewaehlterMangel.beschreibung && (
                        <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 4 }}>{ausgewaehlterMangel.beschreibung}</div>
                      )}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: dringlichkeitFarbe[ausgewaehlterMangel.dringlichkeit] }}>
                      {ausgewaehlterMangel.dringlichkeit.toUpperCase()}
                    </span>
                  </div>
                  <select
                    value={ausgewaehlterMangel.status}
                    onChange={(e) => statusAendern(ausgewaehlterMangel.id, e.target.value as Mangel['status'])}
                    style={{ ...eingabeStil, fontSize: 12, padding: '4px 8px' }}
                  >
                    {Object.entries(statusLabel).map(([wert, label]) => (
                      <option key={wert} value={wert}>{label}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={knopfSekundaerStil} onClick={() => positionEntfernen(ausgewaehlterMangel.id)}>Position entfernen</button>
                    <button style={knopfSekundaerStil} onClick={() => setAusgewaehlteId(null)}>Schließen</button>
                  </div>
                </div>
              )}

              {unverortete.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-faint)', marginBottom: 8 }}>
                    Noch nicht verortet ({unverortete.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {unverortete.map((m) => (
                      <button
                        key={m.id}
                        style={{ ...pillStil('neutral'), cursor: 'pointer', border: platzierId === m.id ? '1px solid var(--orange)' : undefined }}
                        onClick={() => setPlatzierId(m.id)}
                      >
                        {m.titel}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
