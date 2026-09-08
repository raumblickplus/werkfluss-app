import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

type Projekt = { id: string; name: string; kunde_name: string | null }
type Muster = {
  id: string
  name: string
  kategorie: string | null
  bild_url: string | null
  notiz: string | null
}

// Eigenständige, dunkle Bühne statt normaler App-Seite (siehe .mappe-* in
// index.css) – bewusst kein <AppShell>, damit Sidebar/Topbar komplett
// ausgeblendet sind und sich das wie ein eigenes Erlebnis anfühlt, das man
// z. B. gemeinsam mit dem Kunden anschauen kann.
const dunkelEingabe = {
  padding: '10px 13px',
  borderRadius: 13,
  border: '1px solid rgba(243,239,226,.14)',
  fontSize: 12.5,
  fontFamily: 'var(--font-body)',
  background: 'rgba(243,239,226,.06)',
  color: 'var(--ink)',
} as const

const dunkelKnopf = {
  padding: '10px 18px',
  borderRadius: 999,
  border: 'none',
  background: 'var(--orange)',
  color: 'var(--on-accent)',
  fontWeight: 700,
  fontSize: 12.5,
  cursor: 'pointer',
} as const

const dunkelKnopfSekundaer = {
  ...dunkelKnopf,
  background: 'rgba(243,239,226,.08)',
  color: 'var(--ink)',
} as const

export default function Projektmappe() {
  const navigate = useNavigate()
  const { aktivFirma } = useAuth()
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [aktivesProjektId, setAktivesProjektId] = useState<string | null>(null)
  const [muster, setMuster] = useState<Muster[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')

  const [formOffen, setFormOffen] = useState(false)
  const [name, setName] = useState('')
  const [kategorie, setKategorie] = useState('')
  const [notiz, setNotiz] = useState('')
  const [bilddatei, setBilddatei] = useState<File | null>(null)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    async function ladeProjekte() {
      if (!aktivFirma) return
      const { data } = await supabase
        .from('projekte')
        .select('id, name, kunde_name')
        .eq('firma_id', aktivFirma.id)
        .order('erstellt_am', { ascending: false })
      const liste = (data ?? []) as Projekt[]
      setProjekte(liste)
      setAktivesProjektId((aktuell) => aktuell ?? liste[0]?.id ?? null)
    }
    ladeProjekte()
  }, [aktivFirma?.id])

  useEffect(() => {
    async function ladeMuster() {
      if (!aktivesProjektId) {
        setMuster([])
        return
      }
      setLadeStatus('laedt')
      const { data } = await supabase
        .from('projektmappe_muster')
        .select('id, name, kategorie, bild_url, notiz')
        .eq('projekt_id', aktivesProjektId)
        .order('erstellt_am', { ascending: false })
      setMuster((data ?? []) as Muster[])
      setLadeStatus('bereit')
    }
    ladeMuster()
  }, [aktivesProjektId])

  function formZuruecksetzen() {
    setName('')
    setKategorie('')
    setNotiz('')
    setBilddatei(null)
    setFehler(null)
  }

  async function musterErstellen(e: FormEvent) {
    e.preventDefault()
    if (!aktivesProjektId || !name.trim()) return
    setWirdGespeichert(true)
    setFehler(null)
    try {
      let bildUrl: string | null = null
      if (bilddatei) {
        const endung = bilddatei.name.split('.').pop() || 'jpg'
        const pfad = `${aktivesProjektId}/${crypto.randomUUID()}.${endung}`
        const { error: uploadFehler } = await supabase.storage.from('materialmuster').upload(pfad, bilddatei, {
          cacheControl: '3600',
          upsert: false,
        })
        if (uploadFehler) throw uploadFehler
        bildUrl = supabase.storage.from('materialmuster').getPublicUrl(pfad).data.publicUrl
      }
      const { error: insertFehler } = await supabase.from('projektmappe_muster').insert({
        projekt_id: aktivesProjektId,
        name: name.trim(),
        kategorie: kategorie.trim() || null,
        notiz: notiz.trim() || null,
        bild_url: bildUrl,
      })
      if (insertFehler) throw insertFehler
      formZuruecksetzen()
      setFormOffen(false)
      const { data } = await supabase
        .from('projektmappe_muster')
        .select('id, name, kategorie, bild_url, notiz')
        .eq('projekt_id', aktivesProjektId)
        .order('erstellt_am', { ascending: false })
      setMuster((data ?? []) as Muster[])
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Konnte nicht gespeichert werden.')
    } finally {
      setWirdGespeichert(false)
    }
  }

  async function musterLoeschen(m: Muster) {
    if (!confirm(`„${m.name}" wirklich entfernen?`)) return
    setMuster((prev) => prev.filter((x) => x.id !== m.id))
    await supabase.from('projektmappe_muster').delete().eq('id', m.id)
  }

  const aktivesProjekt = projekte.find((p) => p.id === aktivesProjektId) ?? null

  return (
    <div className="mappe-buehne">
      <div className="mappe-kopf">
        <div>
          <div className="mappe-kopf-titel">Projektmappe</div>
          <div className="mappe-kopf-sub">
            {aktivesProjekt
              ? aktivesProjekt.kunde_name
                ? `${aktivesProjekt.name} · ${aktivesProjekt.kunde_name}`
                : aktivesProjekt.name
              : 'Digitale Mappe fürs Kundengespräch'}
          </div>
        </div>
        <button className="mappe-verlassen" onClick={() => navigate('/')}>
          ← Zurück zur App
        </button>
      </div>

      <div className="mappe-koerper">
        <div className="mappe-buehnenflaeche">
          {!aktivesProjekt ? (
            <div className="mappe-leer">
              <p>Wähle rechts ein Projekt aus, um die Materialmuster zu sehen.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, margin: 0 }}>Materialmuster</h2>
                <button style={formOffen ? dunkelKnopfSekundaer : dunkelKnopf} onClick={() => setFormOffen((v) => !v)}>
                  {formOffen ? 'Abbrechen' : '+ Muster hinzufügen'}
                </button>
              </div>

              {formOffen && (
                <form
                  onSubmit={musterErstellen}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 26, padding: 18,
                    borderRadius: 18, background: 'rgba(243,239,226,.04)', border: '1px solid rgba(243,239,226,.08)',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <input style={dunkelEingabe} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, z. B. Feinsteinzeug Grau" required />
                    <input style={dunkelEingabe} value={kategorie} onChange={(e) => setKategorie(e.target.value)} placeholder="Kategorie, z. B. Boden" />
                    <input style={dunkelEingabe} type="file" accept="image/*" onChange={(e) => setBilddatei(e.target.files?.[0] ?? null)} />
                  </div>
                  <textarea
                    style={{ ...dunkelEingabe, minHeight: 56, resize: 'vertical' }}
                    value={notiz}
                    onChange={(e) => setNotiz(e.target.value)}
                    placeholder="Notiz (optional)"
                  />
                  {fehler && <p style={{ margin: 0, fontSize: 12.5, color: '#E8836B' }}>{fehler}</p>}
                  <div>
                    <button type="submit" style={dunkelKnopf} disabled={wirdGespeichert || !name.trim()}>
                      {wirdGespeichert ? 'Speichert …' : 'Hinzufügen'}
                    </button>
                  </div>
                </form>
              )}

              {ladeStatus === 'laedt' ? (
                <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>
              ) : muster.length === 0 ? (
                <p style={{ color: 'var(--ink-faint)' }}>Noch keine Materialmuster für dieses Projekt hinterlegt.</p>
              ) : (
                <div className="muster-grid">
                  {muster.map((m) => (
                    <div key={m.id} className="muster-kachel">
                      <button className="muster-loeschen" onClick={() => musterLoeschen(m)} title="Entfernen">
                        ×
                      </button>
                      <div className="muster-kachel-bild">
                        {m.bild_url ? (
                          <img src={m.bild_url} alt={m.name} />
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Kein Bild</span>
                        )}
                      </div>
                      <div className="muster-kachel-info">
                        <div className="muster-kachel-name">{m.name}</div>
                        {m.kategorie && <div className="muster-kachel-kategorie">{m.kategorie}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mappe-projektliste">
          <div className="mappe-projektliste-titel">Projekte</div>
          {projekte.map((p) => (
            <button
              key={p.id}
              className={`mappe-projekt-item${p.id === aktivesProjektId ? ' aktiv' : ''}`}
              onClick={() => setAktivesProjektId(p.id)}
            >
              <span className="nm">{p.name}</span>
              {p.kunde_name && <span className="kd">{p.kunde_name}</span>}
            </button>
          ))}
          {projekte.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Noch keine Projekte angelegt.</p>
          )}
        </div>
      </div>
    </div>
  )
}
