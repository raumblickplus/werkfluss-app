import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil, pillStil } from '../stil'

type Gewerk = { id: string; name: string; sortierung: number }
type Dokument = { id: string; artikel_id: string; dateiname: string; pfad: string }
type Artikel = {
  id: string
  gewerk_id: string | null
  bezeichnung: string
  hersteller: string | null
  artikelnummer: string | null
  lieferstatus: 'geplant' | 'bestellt' | 'unterwegs' | 'geliefert' | 'verbaut'
  liefertermin: string | null
  notiz: string | null
}

const statusLabel: Record<Artikel['lieferstatus'], string> = {
  geplant: 'Geplant',
  bestellt: 'Bestellt',
  unterwegs: 'Unterwegs',
  geliefert: 'Geliefert',
  verbaut: 'Verbaut',
}
const statusVariante: Record<Artikel['lieferstatus'], 'ok' | 'warn' | 'bad' | 'neutral'> = {
  geplant: 'neutral',
  bestellt: 'warn',
  unterwegs: 'warn',
  geliefert: 'ok',
  verbaut: 'ok',
}
const statusOptionen = Object.keys(statusLabel) as Artikel['lieferstatus'][]

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function TechnikHub({ projektId }: { projektId: string }) {
  const [artikel, setArtikel] = useState<Artikel[]>([])
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [gewerke, setGewerke] = useState<Gewerk[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [neueBezeichnung, setNeueBezeichnung] = useState('')
  const [neuerHersteller, setNeuerHersteller] = useState('')
  const [neueArtikelnummer, setNeueArtikelnummer] = useState('')
  const [neuesGewerkId, setNeuesGewerkId] = useState('')
  const [anlegenLaeuft, setAnlegenLaeuft] = useState(false)

  const [uploadLaeuftFuer, setUploadLaeuftFuer] = useState<string | null>(null)
  const dateiInputs = useRef<Record<string, HTMLInputElement | null>>({})

  async function laden() {
    setLadeStatus('laedt')
    const [{ data: aData }, { data: gData }] = await Promise.all([
      supabase
        .from('technik_artikel')
        .select('id, gewerk_id, bezeichnung, hersteller, artikelnummer, lieferstatus, liefertermin, notiz')
        .eq('projekt_id', projektId)
        .order('erstellt_am', { ascending: false }),
      supabase.from('gewerke').select('id, name, sortierung').order('sortierung'),
    ])
    const artikelListe = (aData ?? []) as Artikel[]
    setArtikel(artikelListe)
    setGewerke((gData ?? []) as Gewerk[])

    if (artikelListe.length > 0) {
      const { data: dData } = await supabase
        .from('technik_dokumente')
        .select('id, artikel_id, dateiname, pfad')
        .in('artikel_id', artikelListe.map((a) => a.id))
      setDokumente((dData ?? []) as Dokument[])
    } else {
      setDokumente([])
    }
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function artikelAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!neueBezeichnung.trim()) return
    setAnlegenLaeuft(true)
    const { error } = await supabase.from('technik_artikel').insert({
      projekt_id: projektId,
      gewerk_id: neuesGewerkId || null,
      bezeichnung: neueBezeichnung.trim(),
      hersteller: neuerHersteller.trim() || null,
      artikelnummer: neueArtikelnummer.trim() || null,
    })
    setAnlegenLaeuft(false)
    if (!error) {
      setNeueBezeichnung(''); setNeuerHersteller(''); setNeueArtikelnummer(''); setNeuesGewerkId('')
      setZeigeFormular(false)
      await laden()
    }
  }

  async function statusAendern(a: Artikel, neuerStatus: Artikel['lieferstatus']) {
    setArtikel((prev) => prev.map((x) => (x.id === a.id ? { ...x, lieferstatus: neuerStatus } : x)))
    await supabase.from('technik_artikel').update({ lieferstatus: neuerStatus }).eq('id', a.id)
  }

  async function lieferterminSpeichern(a: Artikel, datum: string) {
    await supabase.from('technik_artikel').update({ liefertermin: datum || null }).eq('id', a.id)
  }

  async function loeschen(a: Artikel) {
    if (!confirm(`Artikel „${a.bezeichnung}" wirklich entfernen?`)) return
    setArtikel((prev) => prev.filter((x) => x.id !== a.id))
    await supabase.from('technik_artikel').delete().eq('id', a.id)
  }

  async function dateiHochladen(artikelId: string, datei: File) {
    setUploadLaeuftFuer(artikelId)
    const pfad = `${projektId}/${artikelId}/${Date.now()}-${datei.name}`
    const { error: uploadFehler } = await supabase.storage.from('technik-dokumente').upload(pfad, await datei.arrayBuffer(), {
      contentType: datei.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })
    if (!uploadFehler) {
      await supabase.from('technik_dokumente').insert({ artikel_id: artikelId, dateiname: datei.name, pfad })
      await laden()
    }
    setUploadLaeuftFuer(null)
  }

  function dokumentUrl(pfad: string) {
    return supabase.storage.from('technik-dokumente').getPublicUrl(pfad).data.publicUrl
  }

  const sektionen = useMemo(() => {
    const gruppen = new Map<string, Artikel[]>()
    for (const a of artikel) {
      const key = a.gewerk_id ?? '__ohne__'
      if (!gruppen.has(key)) gruppen.set(key, [])
      gruppen.get(key)!.push(a)
    }
    const geordnet = gewerke
      .filter((g) => gruppen.has(g.id))
      .map((g) => ({ titel: g.name, artikel: gruppen.get(g.id)! }))
    if (gruppen.has('__ohne__')) {
      geordnet.push({ titel: 'Ohne Gewerk', artikel: gruppen.get('__ohne__')! })
    }
    return geordnet
  }, [artikel, gewerke])

  if (ladeStatus === 'laedt') return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Artikel'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={artikelAnlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '2 1 240px' }}>
              Bezeichnung
              <input style={eingabeStil} value={neueBezeichnung} onChange={(e) => setNeueBezeichnung(e.target.value)} placeholder="z. B. Deckenleuchte Wohnzimmer" required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 180px' }}>
              Gewerk
              <select style={eingabeStil} value={neuesGewerkId} onChange={(e) => setNeuesGewerkId(e.target.value)}>
                <option value="">– kein Gewerk –</option>
                {gewerke.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 180px' }}>
              Hersteller (optional)
              <input style={eingabeStil} value={neuerHersteller} onChange={(e) => setNeuerHersteller(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 160px' }}>
              Artikelnummer (optional)
              <input style={eingabeStil} value={neueArtikelnummer} onChange={(e) => setNeueArtikelnummer(e.target.value)} />
            </label>
          </div>
          <button type="submit" style={knopfStil} disabled={anlegenLaeuft || !neueBezeichnung.trim()}>
            {anlegenLaeuft ? 'Speichert …' : 'Artikel speichern'}
          </button>
        </form>
      )}

      {artikel.length === 0 && <p style={{ color: 'var(--ink-faint)' }}>Noch keine Artikel angelegt.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {sektionen.map((sektion) => (
          <div key={sektion.titel}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              {sektion.titel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sektion.artikel.map((a) => {
                const eigeneDokumente = dokumente.filter((d) => d.artikel_id === a.id)
                return (
                  <div key={a.id} style={karteStil}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.bezeichnung}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                          {[a.hersteller, a.artikelnummer].filter(Boolean).join(' · ') || 'Kein Hersteller/Artikelnr. hinterlegt'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          style={{ ...eingabeStil, width: 'auto' }}
                          value={a.lieferstatus}
                          onChange={(e) => statusAendern(a, e.target.value as Artikel['lieferstatus'])}
                        >
                          {statusOptionen.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                        </select>
                        <span style={pillStil(statusVariante[a.lieferstatus])}>{statusLabel[a.lieferstatus]}</span>
                        <button
                          onClick={() => loeschen(a)}
                          title="Entfernen"
                          style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--ink-faint)', padding: '0 4px' }}
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <label style={{ fontSize: 12, color: 'var(--ink-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        Liefertermin
                        <input
                          type="date"
                          style={{ ...eingabeStil, padding: '5px 8px' }}
                          defaultValue={a.liefertermin ?? ''}
                          onBlur={(e) => lieferterminSpeichern(a, e.target.value)}
                        />
                      </label>
                      {a.liefertermin && <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>({formatDatum(a.liefertermin)})</span>}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      {eigeneDokumente.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                          {eigeneDokumente.map((d) => (
                            <a
                              key={d.id}
                              href={dokumentUrl(d.pfad)}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 12, color: 'var(--orange-text)', textDecoration: 'underline' }}
                            >
                              📄 {d.dateiname}
                            </a>
                          ))}
                        </div>
                      )}
                      <input
                        ref={(el) => { dateiInputs.current[a.id] = el }}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={(e) => { const datei = e.target.files?.[0]; if (datei) dateiHochladen(a.id, datei); e.target.value = '' }}
                      />
                      <button
                        type="button"
                        onClick={() => dateiInputs.current[a.id]?.click()}
                        disabled={uploadLaeuftFuer === a.id}
                        style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'transparent' }}
                      >
                        {uploadLaeuftFuer === a.id ? 'Lädt hoch …' : '+ Datenblatt hochladen'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="footnote">
        Datenblätter, Lieferstatus und Liefertermine je Artikel an einem Ort statt verteilt über E-Mail-Anhänge
        und WhatsApp-Fotos. Ein KI-Kompatibilitätscheck (z. B. Trafo-Dimensionierung bei KNX/Loxone-Anlagen)
        und eine schematische Kabelführungsdarstellung sind bewusst nicht Teil dieser Umsetzung.
      </p>
    </div>
  )
}
