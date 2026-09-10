import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil } from '../stil'

type Version = {
  id: string
  dokument_id: string
  versionsnummer: number
  dateiname: string
  pfad: string
  erstellt_am: string
  profile: { vollname: string } | { vollname: string }[] | null
}
type Dokument = { id: string; titel: string; erstellt_am: string }

function formatZeitpunkt(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function vollname(p: Version['profile']) {
  return Array.isArray(p) ? p[0]?.vollname ?? null : p?.vollname ?? null
}

// Plan- und Dokumentenverwaltung mit Versionierung (Konzept Abschnitt 8.1).
// Getrennt von den zweckgebundenen Foto-Uploads (Bautagebuch, Mängel,
// Grundriss) - hier geht es um Pläne/Verträge/Ausführungsunterlagen, bei
// denen die Versionshistorie selbst die Anforderung ist.
export default function Dokumente({ projektId }: { projektId: string }) {
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [versionen, setVersionen] = useState<Version[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [neuerTitel, setNeuerTitel] = useState('')
  const [neueDatei, setNeueDatei] = useState<File | null>(null)
  const [anlegenLaeuft, setAnlegenLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [offeneVersionen, setOffeneVersionen] = useState<Set<string>>(new Set())
  const versionInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [uploadLaeuftFuer, setUploadLaeuftFuer] = useState<string | null>(null)

  async function laden() {
    setLadeStatus('laedt')
    const { data: dData } = await supabase
      .from('dokumente')
      .select('id, titel, erstellt_am')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: false })
    const dokumenteListe = (dData ?? []) as Dokument[]
    setDokumente(dokumenteListe)

    if (dokumenteListe.length > 0) {
      const { data: vData } = await supabase
        .from('dokument_versionen')
        .select('id, dokument_id, versionsnummer, dateiname, pfad, erstellt_am, profile(vollname)')
        .in('dokument_id', dokumenteListe.map((d) => d.id))
        .order('versionsnummer', { ascending: false })
      setVersionen((vData ?? []) as unknown as Version[])
    } else {
      setVersionen([])
    }
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function dokumentAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!neuerTitel.trim() || !neueDatei) { setFehler('Titel und Datei sind erforderlich.'); return }
    setAnlegenLaeuft(true)
    setFehler(null)
    const { data: neuesDokument, error } = await supabase
      .from('dokumente')
      .insert({ projekt_id: projektId, titel: neuerTitel.trim() })
      .select('id')
      .single()
    if (error || !neuesDokument) { setFehler('Konnte nicht angelegt werden.'); setAnlegenLaeuft(false); return }

    const pfad = `${projektId}/${neuesDokument.id}/1-${neueDatei.name}`
    const { error: uploadFehler } = await supabase.storage.from('projekt-dokumente').upload(pfad, await neueDatei.arrayBuffer(), {
      contentType: neueDatei.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })
    if (!uploadFehler) {
      await supabase.from('dokument_versionen').insert({
        dokument_id: neuesDokument.id,
        versionsnummer: 1,
        dateiname: neueDatei.name,
        pfad,
      })
    }
    setAnlegenLaeuft(false)
    setNeuerTitel(''); setNeueDatei(null)
    setZeigeFormular(false)
    await laden()
  }

  async function neueVersionHochladen(dokumentId: string, datei: File) {
    setUploadLaeuftFuer(dokumentId)
    const bisherige = versionen.filter((v) => v.dokument_id === dokumentId)
    const naechsteNummer = bisherige.length > 0 ? Math.max(...bisherige.map((v) => v.versionsnummer)) + 1 : 1
    const pfad = `${projektId}/${dokumentId}/${naechsteNummer}-${datei.name}`
    const { error: uploadFehler } = await supabase.storage.from('projekt-dokumente').upload(pfad, await datei.arrayBuffer(), {
      contentType: datei.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })
    if (!uploadFehler) {
      await supabase.from('dokument_versionen').insert({
        dokument_id: dokumentId,
        versionsnummer: naechsteNummer,
        dateiname: datei.name,
        pfad,
      })
      await laden()
    }
    setUploadLaeuftFuer(null)
  }

  async function dokumentOeffnen(pfad: string) {
    const { data } = await supabase.storage.from('projekt-dokumente').createSignedUrl(pfad, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function dokumentLoeschen(d: Dokument) {
    if (!confirm(`„${d.titel}" inkl. aller Versionen wirklich löschen?`)) return
    setDokumente((prev) => prev.filter((x) => x.id !== d.id))
    await supabase.from('dokumente').delete().eq('id', d.id)
  }

  function toggleVersionen(dokumentId: string) {
    setOffeneVersionen((prev) => {
      const neu = new Set(prev)
      neu.has(dokumentId) ? neu.delete(dokumentId) : neu.add(dokumentId)
      return neu
    })
  }

  const versionenNachDokument = useMemo(() => {
    const gruppen = new Map<string, Version[]>()
    for (const v of versionen) {
      if (!gruppen.has(v.dokument_id)) gruppen.set(v.dokument_id, [])
      gruppen.get(v.dokument_id)!.push(v)
    }
    return gruppen
  }, [versionen])

  if (ladeStatus === 'laedt') return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Dokument'}
        </button>
      </div>

      {zeigeFormular && (
        <form onSubmit={dokumentAnlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Titel
            <input style={eingabeStil} value={neuerTitel} onChange={(e) => setNeuerTitel(e.target.value)} placeholder="z. B. Grundriss OG, Werkvertrag Trockenbau" required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Datei (Version 1)
            <input type="file" onChange={(e) => setNeueDatei(e.target.files?.[0] ?? null)} required />
          </label>
          {fehler && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>}
          <button type="submit" style={knopfStil} disabled={anlegenLaeuft || !neuerTitel.trim() || !neueDatei}>
            {anlegenLaeuft ? 'Speichert …' : 'Dokument anlegen'}
          </button>
        </form>
      )}

      {dokumente.length === 0 && <p style={{ color: 'var(--ink-faint)' }}>Noch keine Dokumente abgelegt.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dokumente.map((d) => {
          const eigeneVersionen = (versionenNachDokument.get(d.id) ?? []).sort((a, b) => b.versionsnummer - a.versionsnummer)
          const aktuell = eigeneVersionen[0]
          const versionenOffen = offeneVersionen.has(d.id)
          return (
            <div key={d.id} style={karteStil}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>{d.titel}</div>
                  {aktuell && (
                    <button
                      type="button"
                      onClick={() => dokumentOeffnen(aktuell.pfad)}
                      style={{ textAlign: 'left', fontSize: 12.5, padding: '2px 0', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--orange-text)', textDecoration: 'underline' }}
                    >
                      📄 {aktuell.dateiname} · Version {aktuell.versionsnummer}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => dokumentLoeschen(d)}
                  title="Entfernen"
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--ink-faint)', padding: '0 4px' }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {eigeneVersionen.length > 1 && (
                  <button
                    type="button"
                    onClick={() => toggleVersionen(d.id)}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'transparent' }}
                  >
                    {versionenOffen ? 'Versionen ausblenden' : `Alle ${eigeneVersionen.length} Versionen`}
                  </button>
                )}
                <input
                  ref={(el) => { versionInputs.current[d.id] = el }}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => { const datei = e.target.files?.[0]; if (datei) neueVersionHochladen(d.id, datei); e.target.value = '' }}
                />
                <button
                  type="button"
                  onClick={() => versionInputs.current[d.id]?.click()}
                  disabled={uploadLaeuftFuer === d.id}
                  style={knopfSekundaerStil}
                >
                  {uploadLaeuftFuer === d.id ? 'Lädt hoch …' : '+ Neue Version'}
                </button>
              </div>

              {versionenOffen && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '2px solid var(--glass-border)', paddingLeft: 12 }}>
                  {eigeneVersionen.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => dokumentOeffnen(v.pfad)}
                      style={{ textAlign: 'left', fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-dim)' }}
                    >
                      Version {v.versionsnummer} · {v.dateiname} · {formatZeitpunkt(v.erstellt_am)}{vollname(v.profile) ? ` · ${vollname(v.profile)}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="footnote">
        Pläne, Verträge und Ausführungsunterlagen mit vollständiger Versionshistorie – jede neue Version
        ersetzt nicht die alte, sondern ergänzt sie nachvollziehbar. Offen für alle Projektbeteiligten.
      </p>
    </div>
  )
}
