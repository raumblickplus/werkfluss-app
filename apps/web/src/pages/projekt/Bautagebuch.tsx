import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { adresseZuKoordinaten, aktuellesWetter, type Koordinaten } from '../../lib/wetter'
import { eingabeStil, knopfStil, karteStil } from '../stil'

type Gewerk = { id: string; name: string }
type Standardaufgabe = { id: string; titel: string }
type Beteiligter = { id: string; name: string; rolle: string | null }

type Eintrag = {
  id: string
  datum: string
  wetter: string | null
  temperatur_grad: number | null
  taetigkeiten: string | null
  besonderheiten: string | null
  kunde_anwesend: boolean
  gewerke: { name: string } | null
  fotos: { url: string }[]
  bautagebuch_aufgaben: { titel: string; erledigt: boolean }[]
  bautagebuch_anwesende: { projekt_beteiligte: { name: string } | null }[]
}

type Einstufung = 'hinweis' | 'empfehlung' | 'moeglicher_mangel'
type FotoErgebnis = { beobachtungen: { aussage: string; einstufung: Einstufung }[]; zusammenfassung: string }

const einstufungLabel: Record<Einstufung, string> = {
  hinweis: 'Hinweis',
  empfehlung: 'Empfehlung',
  moeglicher_mangel: 'Möglicher Mangel',
}
const einstufungFarbe: Record<Einstufung, string> = {
  hinweis: 'var(--ink-faint)',
  empfehlung: 'var(--orange-text)',
  moeglicher_mangel: 'var(--red)',
}

type Props = {
  projektId: string
  adresse: string | null
  koordinaten: Koordinaten | null
}

export default function Bautagebuch({ projektId, adresse, koordinaten }: Props) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)

  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [beteiligte, setBeteiligte] = useState<Beteiligter[]>([])
  const [gewerkId, setGewerkId] = useState('')
  const [standardaufgaben, setStandardaufgaben] = useState<Standardaufgabe[]>([])
  const [erledigteIds, setErledigteIds] = useState<Set<string>>(new Set())
  const [zusatzaufgaben, setZusatzaufgaben] = useState<string[]>([])
  const [neueZusatzaufgabe, setNeueZusatzaufgabe] = useState('')
  const [anwesendeIds, setAnwesendeIds] = useState<Set<string>>(new Set())
  const [kundeAnwesend, setKundeAnwesend] = useState(false)

  const [taetigkeiten, setTaetigkeiten] = useState('')
  const [wetter, setWetter] = useState('')
  const [temperatur, setTemperatur] = useState('')
  const [besonderheiten, setBesonderheiten] = useState('')
  const [wetterStatus, setWetterStatus] = useState<'inaktiv' | 'laedt' | 'gefunden' | 'nicht_gefunden'>('inaktiv')
  const [sendet, setSendet] = useState(false)
  const [fotoDateien, setFotoDateien] = useState<File[]>([])
  const [einschaetzungenByFoto, setEinschaetzungenByFoto] = useState<Map<string, FotoErgebnis>>(new Map())
  const [ladendeFotos, setLadendeFotos] = useState<Set<string>>(new Set())
  const [einschaetzungFehler, setEinschaetzungFehler] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const { data, error } = await supabase
      .from('bautagebuch_eintraege')
      .select(
        'id, datum, wetter, temperatur_grad, taetigkeiten, besonderheiten, kunde_anwesend, gewerke(name), fotos, bautagebuch_aufgaben(titel, erledigt), bautagebuch_anwesende(projekt_beteiligte(name))'
      )
      .eq('projekt_id', projektId)
      .order('datum', { ascending: false })
      .order('erstellt_am', { ascending: false })

    if (error) { setLadeStatus('fehler'); return }
    const geladeneEintraege = (data ?? []) as unknown as Eintrag[]
    setEintraege(geladeneEintraege)

    const eintragIds = geladeneEintraege.map((e) => e.id)
    if (eintragIds.length > 0) {
      const { data: einschaetzungenData } = await supabase
        .from('foto_ki_einschaetzungen')
        .select('bautagebuch_id, foto_url, ergebnis, erstellt_am')
        .in('bautagebuch_id', eintragIds)
        .order('erstellt_am', { ascending: false })
      const neueMap = new Map<string, FotoErgebnis>()
      for (const e of (einschaetzungenData ?? []) as Array<{ foto_url: string; ergebnis: FotoErgebnis }>) {
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
    supabase
      .from('projekt_beteiligte')
      .select('id, name, rolle')
      .eq('projekt_id', projektId)
      .then(({ data }) => setBeteiligte(data ?? []))
  }, [projektId])

  useEffect(() => {
    if (!gewerkId) { setStandardaufgaben([]); setErledigteIds(new Set()); return }
    supabase
      .from('gewerk_standardaufgaben')
      .select('id, titel')
      .eq('gewerk_id', gewerkId)
      .order('sortierung')
      .then(({ data }) => {
        setStandardaufgaben(data ?? [])
        setErledigteIds(new Set())
      })
  }, [gewerkId])

  async function wetterLaden() {
    setWetterStatus('laedt')
    let punkt = koordinaten
    if (!punkt && adresse) {
      punkt = await adresseZuKoordinaten(adresse)
      if (punkt) {
        supabase.from('projekte').update({ breitengrad: punkt.breitengrad, laengengrad: punkt.laengengrad }).eq('id', projektId).then(() => {})
      }
    }
    if (!punkt) { setWetterStatus('nicht_gefunden'); return }
    const wetterDaten = await aktuellesWetter(punkt)
    if (!wetterDaten) { setWetterStatus('nicht_gefunden'); return }
    setWetter(wetterDaten.beschreibung)
    setTemperatur(String(Math.round(wetterDaten.temperatur)))
    setWetterStatus('gefunden')
  }

  function formularOeffnen() {
    setZeigeFormular(true)
    wetterLaden()
  }

  function toggleErledigt(id: string) {
    setErledigteIds((vorherig) => {
      const neu = new Set(vorherig)
      neu.has(id) ? neu.delete(id) : neu.add(id)
      return neu
    })
  }

  function toggleAnwesend(id: string) {
    setAnwesendeIds((vorherig) => {
      const neu = new Set(vorherig)
      neu.has(id) ? neu.delete(id) : neu.add(id)
      return neu
    })
  }

  function zusatzaufgabeHinzufuegen() {
    if (!neueZusatzaufgabe.trim()) return
    setZusatzaufgaben((v) => [...v, neueZusatzaufgabe.trim()])
    setNeueZusatzaufgabe('')
  }

  function formularZuruecksetzen() {
    setGewerkId(''); setStandardaufgaben([]); setErledigteIds(new Set())
    setZusatzaufgaben([]); setNeueZusatzaufgabe('')
    setAnwesendeIds(new Set()); setKundeAnwesend(false)
    setTaetigkeiten(''); setWetter(''); setTemperatur(''); setBesonderheiten('')
    setWetterStatus('inaktiv')
    setFotoDateien([])
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    setSendet(true)

    const hochgeladeneFotos: { url: string }[] = []
    for (const datei of fotoDateien) {
      const endung = datei.name.split('.').pop() || 'jpg'
      const pfad = `${projektId}/${crypto.randomUUID()}.${endung}`
      const { error: uploadFehler } = await supabase.storage.from('bautagebuch-fotos').upload(pfad, await datei.arrayBuffer(), {
        contentType: datei.type || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      })
      if (!uploadFehler) {
        hochgeladeneFotos.push({ url: supabase.storage.from('bautagebuch-fotos').getPublicUrl(pfad).data.publicUrl })
      }
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { data: neuerEintrag, error } = await supabase
      .from('bautagebuch_eintraege')
      .insert({
        projekt_id: projektId,
        autor_id: user?.id,
        gewerk_id: gewerkId || null,
        kunde_anwesend: kundeAnwesend,
        taetigkeiten: taetigkeiten || null,
        wetter: wetter || null,
        temperatur_grad: temperatur ? Number(temperatur) : null,
        besonderheiten: besonderheiten || null,
        fotos: hochgeladeneFotos,
      })
      .select('id')
      .single()

    if (error || !neuerEintrag) { setSendet(false); return }

    const anwesendeZeilen = Array.from(anwesendeIds).map((beteiligter_id) => ({
      bautagebuch_id: neuerEintrag.id,
      beteiligter_id,
    }))
    if (anwesendeZeilen.length > 0) {
      await supabase.from('bautagebuch_anwesende').insert(anwesendeZeilen)
    }

    const aufgabenZeilen = [
      ...standardaufgaben
        .filter((a) => erledigteIds.has(a.id))
        .map((a) => ({ bautagebuch_id: neuerEintrag.id, standardaufgabe_id: a.id, titel: a.titel, erledigt: true })),
      ...zusatzaufgaben.map((titel) => ({ bautagebuch_id: neuerEintrag.id, standardaufgabe_id: null, titel, erledigt: true })),
    ]
    if (aufgabenZeilen.length > 0) {
      await supabase.from('bautagebuch_aufgaben').insert(aufgabenZeilen)
    }

    formularZuruecksetzen()
    setZeigeFormular(false)
    setSendet(false)
    laden()
  }

  async function einschaetzungAnfordern(bautagebuchId: string, fotoUrl: string) {
    setEinschaetzungFehler(null)
    setLadendeFotos((vorherig) => new Set(vorherig).add(fotoUrl))
    const { data, error } = await supabase.functions.invoke('foto-einschaetzung', {
      body: { bautagebuchId, fotoUrl },
    })
    setLadendeFotos((vorherig) => {
      const neu = new Set(vorherig)
      neu.delete(fotoUrl)
      return neu
    })
    if (error || data?.fehler) {
      setEinschaetzungFehler('KI-Ersteinschätzung konnte nicht abgerufen werden.')
      return
    }
    setEinschaetzungenByFoto((vorherig) => new Map(vorherig).set(fotoUrl, data.ergebnis as FotoErgebnis))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => (zeigeFormular ? setZeigeFormular(false) : formularOeffnen())}>
          {zeigeFormular ? 'Abbrechen' : '+ Eintrag'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={anlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Gewerk (für welches Gewerk gilt dieser Eintrag?)
            <select style={eingabeStil} value={gewerkId} onChange={(e) => setGewerkId(e.target.value)}>
              <option value="">– auswählen –</option>
              {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>

          {gewerkId && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 6 }}>Erledigte Aufgaben heute</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(40,28,14,.03)', borderRadius: 10, padding: 10 }}>
                {standardaufgaben.map((a) => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={erledigteIds.has(a.id)} onChange={() => toggleErledigt(a.id)} />
                    {a.titel}
                  </label>
                ))}
                {zusatzaufgaben.map((titel, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked readOnly />
                    {titel}
                    <button
                      type="button"
                      onClick={() => setZusatzaufgaben((v) => v.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input
                    style={{ ...eingabeStil, flex: 1 }}
                    placeholder="Weitere Aufgabe hinzufügen …"
                    value={neueZusatzaufgabe}
                    onChange={(e) => setNeueZusatzaufgabe(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); zusatzaufgabeHinzufuegen() } }}
                  />
                  <button type="button" onClick={zusatzaufgabeHinzufuegen} style={{ ...eingabeStil, cursor: 'pointer' }}>+ Hinzufügen</button>
                </div>
              </div>
            </div>
          )}

          {beteiligte.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 6 }}>Wer war heute vor Ort?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {beteiligte.map((b) => (
                  <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, background: 'rgba(40,28,14,.04)', padding: '6px 10px', borderRadius: 999, cursor: 'pointer' }}>
                    <input type="checkbox" checked={anwesendeIds.has(b.id)} onChange={() => toggleAnwesend(b.id)} />
                    {b.name}{b.rolle ? ` (${b.rolle})` : ''}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, background: 'rgba(40,28,14,.04)', padding: '6px 10px', borderRadius: 999, cursor: 'pointer' }}>
                  <input type="checkbox" checked={kundeAnwesend} onChange={(e) => setKundeAnwesend(e.target.checked)} />
                  Kunde/Bauherr
                </label>
              </div>
            </div>
          )}
          {beteiligte.length === 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={kundeAnwesend} onChange={(e) => setKundeAnwesend(e.target.checked)} />
              Kunde/Bauherr war heute vor Ort
            </label>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: 2 }}>
              Wetter
              <input style={eingabeStil} value={wetter} onChange={(e) => setWetter(e.target.value)} placeholder="z.B. bewölkt" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', width: 90 }}>
              °C
              <input style={eingabeStil} value={temperatur} onChange={(e) => setTemperatur(e.target.value)} inputMode="numeric" />
            </label>
            <button type="button" onClick={wetterLaden} title="Wetter erneut automatisch abrufen" style={{ ...eingabeStil, cursor: 'pointer', padding: '10px 12px' }}>
              🔄
            </button>
          </div>
          {wetterStatus === 'laedt' && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Wetter wird automatisch geladen …</div>}
          {wetterStatus === 'gefunden' && <div style={{ fontSize: 12, color: 'var(--olive)' }}>Automatisch anhand des Projektstandorts geladen – bei Bedarf anpassen.</div>}
          {wetterStatus === 'nicht_gefunden' && (
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Konnte den Standort nicht automatisch bestimmen – bitte Wetter manuell eintragen.</div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Notizen (optional, zusätzlich zur Checkliste)
            <textarea style={{ ...eingabeStil, minHeight: 50, fontFamily: 'inherit' }} value={taetigkeiten} onChange={(e) => setTaetigkeiten(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Besonderheiten (optional)
            <textarea style={{ ...eingabeStil, minHeight: 50, fontFamily: 'inherit' }} value={besonderheiten} onChange={(e) => setBesonderheiten(e.target.value)} />
          </label>
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
          <button type="submit" style={knopfStil} disabled={sendet}>{sendet ? 'Speichert …' : 'Eintrag speichern'}</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lade Bautagebuch …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Bautagebuch konnte nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && eintraege.length === 0 && <p style={{ color: 'var(--ink-faint)' }}>Noch keine Einträge.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {eintraege.map((e) => {
          const erledigt = e.bautagebuch_aufgaben.filter((a) => a.erledigt)
          const anwesendeNamen = e.bautagebuch_anwesende.map((a) => a.projekt_beteiligte?.name).filter(Boolean) as string[]
          return (
            <div key={e.id} style={{ ...karteStil, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {new Date(e.datum).toLocaleDateString('de-DE')}{e.gewerke ? ` · ${e.gewerke.name}` : ''}
                </span>
                {e.wetter && <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{e.wetter}{e.temperatur_grad !== null ? `, ${e.temperatur_grad}°C` : ''}</span>}
              </div>

              {erledigt.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {erledigt.map((a, i) => (
                    <span key={i} style={{ fontSize: 12, background: 'oklch(90% 0.08 148)', color: 'oklch(30% 0.08 148)', padding: '3px 9px', borderRadius: 999 }}>
                      ✓ {a.titel}
                    </span>
                  ))}
                </div>
              )}

              {(anwesendeNamen.length > 0 || e.kunde_anwesend) && (
                <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 6 }}>
                  Anwesend: {[...anwesendeNamen, ...(e.kunde_anwesend ? ['Kunde/Bauherr'] : [])].join(', ')}
                </div>
              )}

              {e.taetigkeiten && <div style={{ fontSize: 14 }}>{e.taetigkeiten}</div>}
              {e.besonderheiten && <div style={{ fontSize: 13, color: 'var(--orange-text)', marginTop: 6 }}>⚠ {e.besonderheiten}</div>}

              {e.fotos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {e.fotos.map((foto) => {
                    const ergebnis = einschaetzungenByFoto.get(foto.url)
                    const laedt = ladendeFotos.has(foto.url)
                    return (
                      <div key={foto.url} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <img
                            src={foto.url}
                            alt="Baustellenfoto"
                            style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, background: 'var(--surface)' }}
                          />
                          {!ergebnis && (
                            <button
                              type="button"
                              onClick={() => einschaetzungAnfordern(e.id, foto.url)}
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
                              ⚠ Unverbindliche KI-Ersteinschätzung – keine Norm-Prüfung, ersetzt keine fachliche Begutachtung vor Ort
                            </div>
                            {ergebnis.zusammenfassung && (
                              <div style={{ fontSize: 13, marginBottom: ergebnis.beobachtungen.length > 0 ? 6 : 0 }}>{ergebnis.zusammenfassung}</div>
                            )}
                            {ergebnis.beobachtungen.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {ergebnis.beobachtungen.map((b, i) => (
                                  <div key={i} style={{ fontSize: 12.5, display: 'flex', gap: 6 }}>
                                    <span style={{ color: einstufungFarbe[b.einstufung], fontWeight: 700, whiteSpace: 'nowrap' }}>
                                      {einstufungLabel[b.einstufung]}:
                                    </span>
                                    <span>{b.aussage}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {einschaetzungFehler && <p style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 12 }}>{einschaetzungFehler}</p>}
    </div>
  )
}
