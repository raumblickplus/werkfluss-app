import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, knopfSekundaerStil, karteStil } from '../stil'

type Nachricht = {
  id: string
  autor_id: string | null
  text: string
  erstellt_am: string
  profil: string | null
}

type Kollege = { nutzer_id: string; vollname: string }

type AnrufStatus = 'inaktiv' | 'waehlt' | 'verbunden'

type Signal =
  | { typ: 'angenommen' }
  | { typ: 'abgelehnt' }
  | { typ: 'beendet' }
  | { typ: 'angebot'; sdp: RTCSessionDescriptionInit }
  | { typ: 'antwort'; sdp: RTCSessionDescriptionInit }
  | { typ: 'ice'; kandidat: RTCIceCandidateInit }

const ICE_SERVER = { urls: 'stun:stun.l.google.com:19302' }
const KLINGEL_TIMEOUT_MS = 30000

// Projektbezogener Chat + direkte Videotelefonie zwischen Kolleg:innen.
// Die Videotelefonie läuft per WebRTC direkt zwischen den beiden Browsern;
// Supabase Realtime dient nur als "Vermittlungsstelle" für Anruf-Anfrage,
// Angebot/Antwort und ICE-Kandidaten, es fließen keine Anruf-Inhalte über
// den Server. Funktioniert nur, solange beide diesen Tab offen haben – eine
// projektübergreifende Klingel-Benachrichtigung ist bewusst (noch) nicht Teil
// dieser ersten Version, ebenso wenig wie Live-Übersetzung oder eine
// automatische KI-To-Do-Erstellung aus dem Gesprächsverlauf – beides würde
// einen externen Übersetzungs-/KI-Dienst mit eigenem API-Key voraussetzen.
export default function Kommunikation({ projektId }: { projektId: string }) {
  const { session, aktivFirma } = useAuth()
  const meineId = session?.user?.id ?? null

  const [nachrichten, setNachrichten] = useState<Nachricht[]>([])
  const [text, setText] = useState('')
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [kollegen, setKollegen] = useState<Kollege[]>([])
  const listeEndeRef = useRef<HTMLDivElement>(null)

  const [anrufStatus, setAnrufStatus] = useState<AnrufStatus>('inaktiv')
  const [gegenueber, setGegenueber] = useState<Kollege | null>(null)
  const [eingehenderAnruf, setEingehenderAnruf] = useState<{ von: string; vonName: string; kanal: string } | null>(null)
  const [anrufFehler, setAnrufFehler] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const callChannelRef = useRef<RealtimeChannel | null>(null)
  const klingelChannelRef = useRef<RealtimeChannel | null>(null)
  const klingelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  // ICE-Kandidaten, die ankommen, bevor die Gegenseite gesetzt ist, werden
  // zwischengespeichert und nach setRemoteDescription nachgereicht.
  const wartendeIceRef = useRef<RTCIceCandidateInit[]>([])

  async function iceHinzufuegen(kandidat: RTCIceCandidateInit) {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) {
      wartendeIceRef.current.push(kandidat)
      return
    }
    try { await pc.addIceCandidate(kandidat) } catch { /* ignore */ }
  }

  async function wartendeIceNachreichen() {
    const pc = pcRef.current
    if (!pc) return
    const kandidaten = wartendeIceRef.current
    wartendeIceRef.current = []
    for (const k of kandidaten) {
      try { await pc.addIceCandidate(k) } catch { /* ignore */ }
    }
  }

  // ---- Chat laden + live aktualisieren ----
  async function nachrichtenLaden() {
    setLadeStatus('laedt')
    const { data } = await supabase
      .from('projekt_nachrichten')
      .select('id, autor_id, text, erstellt_am, profile(vollname)')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: true })
    setNachrichten(
      ((data ?? []) as unknown as Array<Omit<Nachricht, 'profil'> & { profile: { vollname: string } | { vollname: string }[] | null }>).map((n) => ({
        ...n,
        profil: Array.isArray(n.profile) ? n.profile[0]?.vollname ?? null : n.profile?.vollname ?? null,
      }))
    )
    setLadeStatus('bereit')
  }

  useEffect(() => {
    nachrichtenLaden()
    const kanal = supabase
      .channel(`chat-${projektId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'projekt_nachrichten', filter: `projekt_id=eq.${projektId}` }, () => {
        nachrichtenLaden()
      })
      .subscribe()
    return () => { supabase.removeChannel(kanal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projektId])

  useEffect(() => {
    listeEndeRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nachrichten])

  useEffect(() => {
    if (!aktivFirma) return
    supabase
      .from('firma_mitglieder')
      .select('nutzer_id, profile(vollname)')
      .eq('firma_id', aktivFirma.id)
      .then(({ data }) => {
        const liste = ((data ?? []) as unknown as Array<{ nutzer_id: string; profile: { vollname: string } | { vollname: string }[] | null }>)
          .map((m) => ({ nutzer_id: m.nutzer_id, vollname: Array.isArray(m.profile) ? m.profile[0]?.vollname ?? 'Unbekannt' : m.profile?.vollname ?? 'Unbekannt' }))
          .filter((k) => k.nutzer_id !== meineId)
        setKollegen(liste)
      })
  }, [aktivFirma?.id, meineId])

  async function senden(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || !meineId) return
    const inhalt = text.trim()
    setText('')
    await supabase.from('projekt_nachrichten').insert({ projekt_id: projektId, autor_id: meineId, text: inhalt })
  }

  // ---- Videotelefonie ----

  function aufraeumen() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    if (callChannelRef.current) { supabase.removeChannel(callChannelRef.current); callChannelRef.current = null }
    if (klingelTimeoutRef.current) { clearTimeout(klingelTimeoutRef.current); klingelTimeoutRef.current = null }
    wartendeIceRef.current = []
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    setAnrufStatus('inaktiv')
    setGegenueber(null)
  }

  async function peerVerbindungErstellen(kanal: RealtimeChannel) {
    const pc = new RTCPeerConnection({ iceServers: [ICE_SERVER] })
    pcRef.current = pc
    pc.onicecandidate = (ev) => {
      if (ev.candidate) kanal.send({ type: 'broadcast', event: 'signal', payload: { typ: 'ice', kandidat: ev.candidate.toJSON() } })
    }
    pc.ontrack = (ev) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = ev.streams[0]
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    return pc
  }

  async function anrufen(kollege: Kollege) {
    if (!meineId || anrufStatus !== 'inaktiv') return
    setAnrufFehler(null)
    setGegenueber(kollege)
    setAnrufStatus('waehlt')

    const kanalName = `anruf-${meineId}-${kollege.nutzer_id}-${Date.now()}`
    const kanal = supabase.channel(kanalName)
    callChannelRef.current = kanal

    kanal.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
      if (payload.typ === 'angenommen') {
        try {
          const pc = await peerVerbindungErstellen(kanal)
          const angebot = await pc.createOffer()
          await pc.setLocalDescription(angebot)
          kanal.send({ type: 'broadcast', event: 'signal', payload: { typ: 'angebot', sdp: angebot } })
          setAnrufStatus('verbunden')
          if (klingelTimeoutRef.current) clearTimeout(klingelTimeoutRef.current)
        } catch {
          setAnrufFehler('Kamera/Mikrofon konnten nicht gestartet werden.')
          aufraeumen()
        }
      } else if (payload.typ === 'antwort') {
        await pcRef.current?.setRemoteDescription(payload.sdp)
        await wartendeIceNachreichen()
      } else if (payload.typ === 'ice') {
        await iceHinzufuegen(payload.kandidat)
      } else if (payload.typ === 'abgelehnt') {
        setAnrufFehler(`${kollege.vollname} hat den Anruf abgelehnt.`)
        aufraeumen()
      } else if (payload.typ === 'beendet') {
        aufraeumen()
      }
    })

    kanal.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return
      const klingelKanal = supabase.channel(`klingel-${kollege.nutzer_id}`)
      klingelKanal.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          klingelKanal.send({
            type: 'broadcast', event: 'anruf',
            payload: { von: meineId, kanal: kanalName },
          })
          setTimeout(() => supabase.removeChannel(klingelKanal), 2000)
        }
      })
      klingelTimeoutRef.current = setTimeout(() => {
        setAnrufFehler(`${kollege.vollname} ist gerade nicht erreichbar.`)
        aufraeumen()
      }, KLINGEL_TIMEOUT_MS)
    })
  }

  async function anrufAnnehmen() {
    if (!eingehenderAnruf) return
    const { kanal: kanalName, von } = eingehenderAnruf
    const kanal = supabase.channel(kanalName)
    callChannelRef.current = kanal

    kanal.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
      if (payload.typ === 'angebot') {
        const pc = pcRef.current
        if (!pc) return
        await pc.setRemoteDescription(payload.sdp)
        await wartendeIceNachreichen()
        const antwort = await pc.createAnswer()
        await pc.setLocalDescription(antwort)
        kanal.send({ type: 'broadcast', event: 'signal', payload: { typ: 'antwort', sdp: antwort } })
      } else if (payload.typ === 'ice') {
        await iceHinzufuegen(payload.kandidat)
      } else if (payload.typ === 'beendet') {
        aufraeumen()
        setEingehenderAnruf(null)
      }
    })

    kanal.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return
      try {
        await peerVerbindungErstellen(kanal)
        kanal.send({ type: 'broadcast', event: 'signal', payload: { typ: 'angenommen' } })
        setGegenueber({ nutzer_id: von, vollname: eingehenderAnruf.vonName })
        setAnrufStatus('verbunden')
        setEingehenderAnruf(null)
      } catch {
        setAnrufFehler('Kamera/Mikrofon konnten nicht gestartet werden.')
        setEingehenderAnruf(null)
      }
    })
  }

  function anrufAblehnen() {
    if (!eingehenderAnruf) return
    const kanal = supabase.channel(`klingel-${eingehenderAnruf.von}`)
    kanal.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        kanal.send({ type: 'broadcast', event: 'anruf-abgelehnt', payload: {} })
        setTimeout(() => supabase.removeChannel(kanal), 1000)
      }
    })
    setEingehenderAnruf(null)
  }

  function anrufBeenden() {
    callChannelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { typ: 'beendet' } })
    aufraeumen()
  }

  // Eigenen Klingel-Kanal abonnieren, solange dieser Tab offen ist.
  useEffect(() => {
    if (!meineId) return
    const kanal = supabase
      .channel(`klingel-${meineId}`)
      .on('broadcast', { event: 'anruf' }, ({ payload }: { payload: { von: string; kanal: string } }) => {
        const name = kollegen.find((k) => k.nutzer_id === payload.von)?.vollname ?? 'Unbekannt'
        setEingehenderAnruf({ von: payload.von, vonName: name, kanal: payload.kanal })
      })
      .on('broadcast', { event: 'anruf-abgelehnt' }, () => {
        setAnrufFehler(`${gegenueber?.vollname ?? 'Die Person'} hat den Anruf abgelehnt.`)
        aufraeumen()
      })
      .subscribe()
    klingelChannelRef.current = kanal
    return () => { supabase.removeChannel(kanal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meineId, kollegen])

  useEffect(() => () => { aufraeumen() }, [])

  const nachrichtenSortiert = useMemo(() => nachrichten, [nachrichten])

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...karteStil, padding: 0, display: 'flex', flexDirection: 'column', height: 420 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
            {ladeStatus === 'bereit' && nachrichtenSortiert.length === 0 && (
              <p style={{ color: 'var(--ink-faint)' }}>Noch keine Nachrichten – schreib die erste.</p>
            )}
            {nachrichtenSortiert.map((n) => {
              const eigene = n.autor_id === meineId
              return (
                <div key={n.id} style={{ display: 'flex', flexDirection: 'column', alignItems: eigene ? 'flex-end' : 'flex-start' }}>
                  {!eigene && <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-faint)', marginBottom: 2 }}>{n.profil ?? 'Unbekannt'}</div>}
                  <div
                    style={{
                      maxWidth: '75%', padding: '8px 12px', borderRadius: 14,
                      background: eigene ? 'var(--orange)' : 'var(--surface-raised)',
                      color: eigene ? 'var(--on-accent)' : 'var(--ink)',
                      border: eigene ? 'none' : '1px solid var(--glass-border)',
                      fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}
                  >
                    {n.text}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                    {new Date(n.erstellt_am).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })}
            <div ref={listeEndeRef} />
          </div>
          <form onSubmit={senden} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--glass-border)' }}>
            <input
              style={{ ...eingabeStil, flex: 1 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nachricht schreiben …"
            />
            <button type="submit" style={knopfStil} disabled={!text.trim()}>Senden</button>
          </form>
        </div>
        <p className="footnote">
          Nachrichten bleiben hier dauerhaft gespeichert, statt in WhatsApp zu verschwinden. Live-Übersetzung und eine
          automatische KI-To-Do-Liste aus dem Gesprächsverlauf sind als Ausbaustufe geplant, sobald ein Übersetzungs-/
          KI-Dienst angebunden ist.
        </p>
      </div>

      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-faint)' }}>
          Kolleg:innen anrufen
        </div>
        {kollegen.length === 0 && <p style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Keine weiteren Kolleg:innen.</p>}
        {kollegen.map((k) => (
          <div key={k.nutzer_id} style={{ ...karteStil, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.vollname}</span>
            <button
              onClick={() => anrufen(k)}
              disabled={anrufStatus !== 'inaktiv'}
              title="Videoanruf starten"
              style={{ all: 'unset', cursor: anrufStatus === 'inaktiv' ? 'pointer' : 'default', fontSize: 16, opacity: anrufStatus === 'inaktiv' ? 1 : .4 }}
            >
              📹
            </button>
          </div>
        ))}
        {anrufFehler && (
          <p style={{ fontSize: 12, color: 'var(--red)' }}>{anrufFehler}</p>
        )}
      </div>

      {eingehenderAnruf && anrufStatus === 'inaktiv' && (
        <div style={{ ...karteStil, position: 'fixed', bottom: 24, right: 24, zIndex: 50, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{eingehenderAnruf.vonName} ruft an …</span>
          <button style={knopfStil} onClick={anrufAnnehmen}>Annehmen</button>
          <button style={knopfSekundaerStil} onClick={anrufAblehnen}>Ablehnen</button>
        </div>
      )}

      {(anrufStatus === 'waehlt' || anrufStatus === 'verbunden') && (
        <div style={{ ...karteStil, position: 'fixed', bottom: 24, right: 24, zIndex: 50, padding: 14, width: 300 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>
              {anrufStatus === 'waehlt' ? `Rufe ${gegenueber?.vollname} an …` : gegenueber?.vollname}
            </span>
            <button onClick={anrufBeenden} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>
              Auflegen
            </button>
          </div>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: 12, overflow: 'hidden', background: '#17150F' }}>
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <video
              ref={localVideoRef}
              autoPlay playsInline muted
              style={{ position: 'absolute', bottom: 8, right: 8, width: '30%', borderRadius: 8, border: '1px solid rgba(243,239,226,.3)' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
