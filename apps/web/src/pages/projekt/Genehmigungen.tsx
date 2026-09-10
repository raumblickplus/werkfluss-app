import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { eingabeStil, knopfStil, karteStil, pillStil } from '../stil'

type Dokument = { id: string; genehmigung_id: string; dateiname: string; pfad: string; erstellt_am: string }
type Genehmigung = {
  id: string
  projekt_id: string
  titel: string
  behoerde: string | null
  status: 'vorzubereiten' | 'eingereicht' | 'in_pruefung' | 'genehmigt' | 'genehmigt_mit_auflagen' | 'abgelehnt'
  auflagen: string | null
  eingereicht_am: string | null
  entschieden_am: string | null
  notiz: string | null
  erstellt_am: string
}

const statusLabel: Record<Genehmigung['status'], string> = {
  vorzubereiten: 'Vorzubereiten',
  eingereicht: 'Eingereicht',
  in_pruefung: 'In Prüfung',
  genehmigt: 'Genehmigt',
  genehmigt_mit_auflagen: 'Genehmigt mit Auflagen',
  abgelehnt: 'Abgelehnt',
}
const statusVariante: Record<Genehmigung['status'], 'ok' | 'warn' | 'bad' | 'neutral'> = {
  vorzubereiten: 'neutral',
  eingereicht: 'warn',
  in_pruefung: 'warn',
  genehmigt: 'ok',
  genehmigt_mit_auflagen: 'ok',
  abgelehnt: 'bad',
}
const statusOptionen = Object.keys(statusLabel) as Genehmigung['status'][]

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Genehmigungen({ projektId, istEigentuemer }: { projektId: string; istEigentuemer: boolean }) {
  const [genehmigungen, setGenehmigungen] = useState<Genehmigung[]>([])
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [neuerTitel, setNeuerTitel] = useState('')
  const [neueBehoerde, setNeueBehoerde] = useState('')
  const [anlegenLaeuft, setAnlegenLaeuft] = useState(false)

  const [uploadLaeuftFuer, setUploadLaeuftFuer] = useState<string | null>(null)
  const dateiInputs = useRef<Record<string, HTMLInputElement | null>>({})

  async function laden() {
    setLadeStatus('laedt')
    const { data: gData } = await supabase
      .from('genehmigungen')
      .select('id, projekt_id, titel, behoerde, status, auflagen, eingereicht_am, entschieden_am, notiz, erstellt_am')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: false })
    const genehmigungenListe = (gData ?? []) as Genehmigung[]
    setGenehmigungen(genehmigungenListe)

    if (genehmigungenListe.length > 0) {
      const { data: dData } = await supabase
        .from('genehmigungs_dokumente')
        .select('id, genehmigung_id, dateiname, pfad, erstellt_am')
        .in('genehmigung_id', genehmigungenListe.map((g) => g.id))
        .order('erstellt_am', { ascending: false })
      setDokumente((dData ?? []) as Dokument[])
    } else {
      setDokumente([])
    }
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId])

  async function genehmigungAnlegen(e: FormEvent) {
    e.preventDefault()
    if (!neuerTitel.trim()) return
    setAnlegenLaeuft(true)
    const { error } = await supabase.from('genehmigungen').insert({
      projekt_id: projektId,
      titel: neuerTitel.trim(),
      behoerde: neueBehoerde.trim() || null,
    })
    setAnlegenLaeuft(false)
    if (!error) {
      setNeuerTitel(''); setNeueBehoerde('')
      setZeigeFormular(false)
      await laden()
    }
  }

  async function statusAendern(g: Genehmigung, neuerStatus: Genehmigung['status']) {
    const patch: Partial<Genehmigung> = { status: neuerStatus }
    if (neuerStatus === 'eingereicht' && !g.eingereicht_am) patch.eingereicht_am = new Date().toISOString().slice(0, 10)
    if ((neuerStatus === 'genehmigt' || neuerStatus === 'genehmigt_mit_auflagen' || neuerStatus === 'abgelehnt') && !g.entschieden_am) {
      patch.entschieden_am = new Date().toISOString().slice(0, 10)
    }
    setGenehmigungen((prev) => prev.map((x) => (x.id === g.id ? { ...x, ...patch } : x)))
    await supabase.from('genehmigungen').update(patch).eq('id', g.id)
  }

  async function auflagenSpeichern(g: Genehmigung, auflagen: string) {
    await supabase.from('genehmigungen').update({ auflagen: auflagen || null }).eq('id', g.id)
  }

  async function dateiHochladen(genehmigungId: string, datei: File) {
    setUploadLaeuftFuer(genehmigungId)
    const pfad = `${projektId}/${genehmigungId}/${Date.now()}-${datei.name}`
    const { error: uploadFehler } = await supabase.storage.from('genehmigungs-dokumente').upload(pfad, await datei.arrayBuffer(), {
      contentType: datei.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })
    if (!uploadFehler) {
      await supabase.from('genehmigungs_dokumente').insert({ genehmigung_id: genehmigungId, dateiname: datei.name, pfad })
      await laden()
    }
    setUploadLaeuftFuer(null)
  }

  async function dokumentOeffnen(pfad: string) {
    const { data } = await supabase.storage.from('genehmigungs-dokumente').createSignedUrl(pfad, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (ladeStatus === 'laedt') return <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>

  return (
    <div>
      {istEigentuemer && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)}>
            {zeigeFormular ? 'Abbrechen' : '+ Verfahren anlegen'}
          </button>
        </div>
      )}

      {zeigeFormular && (
        <form onSubmit={genehmigungAnlegen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 220px' }}>
              Titel
              <input style={eingabeStil} value={neuerTitel} onChange={(e) => setNeuerTitel(e.target.value)} placeholder="z. B. Baugenehmigung, Abwasseranschluss" required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)', flex: '1 1 180px' }}>
              Behörde (optional)
              <input style={eingabeStil} value={neueBehoerde} onChange={(e) => setNeueBehoerde(e.target.value)} placeholder="z. B. Bauamt Musterstadt" />
            </label>
          </div>
          <button type="submit" style={knopfStil} disabled={anlegenLaeuft || !neuerTitel.trim()}>
            {anlegenLaeuft ? 'Speichert …' : 'Verfahren anlegen'}
          </button>
        </form>
      )}

      {genehmigungen.length === 0 && <p style={{ color: 'var(--ink-faint)' }}>Noch keine Genehmigungsverfahren angelegt.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {genehmigungen.map((g) => {
          const eigeneDokumente = dokumente.filter((d) => d.genehmigung_id === g.id)
          return (
            <div key={g.id} style={karteStil}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>{g.titel}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                    {g.behoerde ?? 'Keine Behörde hinterlegt'}
                    {g.eingereicht_am ? ` · eingereicht ${formatDatum(g.eingereicht_am)}` : ''}
                    {g.entschieden_am ? ` · entschieden ${formatDatum(g.entschieden_am)}` : ''}
                  </div>
                </div>
                {istEigentuemer ? (
                  <select
                    style={{ ...eingabeStil, width: 'auto' }}
                    value={g.status}
                    onChange={(e) => statusAendern(g, e.target.value as Genehmigung['status'])}
                  >
                    {statusOptionen.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                  </select>
                ) : (
                  <span style={pillStil(statusVariante[g.status])}>{statusLabel[g.status]}</span>
                )}
              </div>

              {(g.status === 'genehmigt_mit_auflagen' || g.auflagen) && (
                istEigentuemer ? (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink-dim)', marginTop: 12 }}>
                    Auflagen
                    <textarea
                      style={{ ...eingabeStil, minHeight: 60, resize: 'vertical' }}
                      defaultValue={g.auflagen ?? ''}
                      onBlur={(e) => auflagenSpeichern(g, e.target.value)}
                      placeholder="z. B. Nachweis Schallschutz bis ..."
                    />
                  </label>
                ) : (
                  g.auflagen && <p style={{ fontSize: 12.5, color: 'var(--ink-dim)', marginTop: 10 }}><strong>Auflagen:</strong> {g.auflagen}</p>
                )
              )}

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                  Dokumente ({eigeneDokumente.length})
                </div>
                {eigeneDokumente.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-faint)' }}>Noch keine Dokumente hochgeladen.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {eigeneDokumente.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => dokumentOeffnen(d.pfad)}
                        style={{ textAlign: 'left', fontSize: 12.5, padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--orange-text)', textDecoration: 'underline' }}
                      >
                        📄 {d.dateiname}
                      </button>
                    ))}
                  </div>
                )}
                {istEigentuemer && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      ref={(el) => { dateiInputs.current[g.id] = el }}
                      type="file"
                      style={{ display: 'none' }}
                      onChange={(e) => { const datei = e.target.files?.[0]; if (datei) dateiHochladen(g.id, datei); e.target.value = '' }}
                    />
                    <button
                      type="button"
                      onClick={() => dateiInputs.current[g.id]?.click()}
                      disabled={uploadLaeuftFuer === g.id}
                      style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--glass-border)', background: 'transparent' }}
                    >
                      {uploadLaeuftFuer === g.id ? 'Lädt hoch …' : '+ Dokument hochladen'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="footnote">
        Strukturierte Verfahrensverfolgung und Dokumentenablage statt E-Mail-Postfach. Eine direkte
        Schnittstelle zu Bauämtern (z. B. über XBau) ist bewusst nicht Teil dieser Umsetzung – dafür braucht
        es eine bundesweite Behördenanbindung, kein Tag-1-Feature.
      </p>
    </div>
  )
}
