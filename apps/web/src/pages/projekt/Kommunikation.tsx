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
  | { typ: 'aufnahme_anfrage'; besprechungId: string }
  | { typ: 'aufnahme_start_ok'; besprechungId: string }
  | { typ: 'aufnahme_abgelehnt' }
  | { typ: 'aufnahme_ende' }

const ICE_SERVER = { urls: 'stun:stun.l.google.com:19302' }
const KLINGEL_TIMEOUT_MS = 30000

const SPRACHEN: { code: string; label: string }[] = [
  { code: 'DE', label: 'Deutsch' },
  { code: 'EN', label: 'Englisch' },
  { code: 'TR', label: 'Türkisch' },
  { code: 'PL', label: 'Polnisch' },
  { code: 'RO', label: 'Rumänisch' },
  { code: 'RU', label: 'Russisch' },
  { code: 'UK', label: 'Ukrainisch' },
  { code: 'IT', label: 'Italienisch' },
  { code: 'FR', label: 'Französisch' },
  { code: 'ES', label: 'Spanisch' },
]

type AufgabenVorschlag = { titel: string; beschreibung?: string }

type AufnahmeStatus = 'keine' | 'anfrage_gesendet' | 'anfrage_erhalten' | 'laeuft'
type Protokoll = {
  teilnehmer: string[]
  zusammenfassung: string
  themen: { titel: string; notiz?: string }[]
  beschluesse: { text: string }[]
}
type Besprechung = {
  id: string
  status: 'angefragt' | 'laeuft' | 'wird_transkribiert' | 'transkribiert' | 'fehler'
  protokoll: Protokoll | null
  erstellt_am: string
}

// Projektbezogener Chat + direkte Videotelefonie zwischen Kolleg:innen, dazu
// Live-Übersetzung (DeepL) und KI-To-Do-Vorschläge (Claude) aus dem Verlauf.
// Die Videotelefonie läuft per WebRTC direkt zwischen den beiden Browsern;
// Supabase Realtime dient nur als "Vermittlungsstelle" für Anruf-Anfrage,
// Angebot/Antwort und ICE-Kandidaten, es fließen keine Anruf-Inhalte über
// den Server. Funktioniert nur, solange beide diesen Tab offen haben – eine
// projektübergreifende Klingel-Benachrichtigung ist bewusst (noch) nicht Teil
// dieser ersten Version.
// Übersetzung und KI-To-Dos laufen über zwei Supabase Edge Functions
// (supabase/functions/uebersetzen, supabase/functions/ki-todos), die die
// Secrets DEEPL_API_KEY bzw. ANTHROPIC_API_KEY serverseitig verwenden – die
// Keys erreichen den Browser nie. Die KI-To-Do-Funktion liest nur (mit RLS
// der aufrufenden Person) und schreibt nichts direkt; die Übernahme in die
// Aufgaben-Tabelle passiert erst nach Bestätigung im Vorschlags-Panel.
export default function Kommunikation({ projektId }: { projektId: string }) {
  const { session, aktivFirma } = useAuth()
  const meineId = session?.user?.id ?? null

  const [nachrichten, setNachrichten] = useState<Nachricht[]>([])
  const [text, setText] = useState('')
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [kollegen, setKollegen] = useState<Kollege[]>([])
  const listeEndeRef = useRef<HTMLDivElement>(null)

  // Live-Übersetzung: Zielsprache global wählbar, Übersetzungen pro Nachricht gecacht.
  const [zielsprache, setZielsprache] = useState('EN')
  const [uebersetzungen, setUebersetzungen] = useState<Record<string, string>>({})
  const [uebersetztWird, setUebersetztWird] = useState<string | null>(null)
  const [uebersetzungsFehler, setUebersetzungsFehler] = useState<string | null>(null)

  // KI-To-Do-Vorschläge aus dem Gesprächsverlauf.
  const [vorschlaege, setVorschlaege] = useState<AufgabenVorschlag[] | null>(null)
  const [vorschlaegeLaden, setVorschlaegeLaden] = useState(false)
  const [vorschlaegeFehler, setVorschlaegeFehler] = useState<string | null>(null)
  const [ausgewaehlteVorschlaege, setAusgewaehlteVorschlaege] = useState<Set<number>>(new Set())
  const [uebernahmeLaeuft, setUebernahmeLaeuft] = useState(false)

  const [anrufStatus, setAnrufStatus] = useState<AnrufStatus>('inaktiv')
  const [gegenueber, setGegenueber] = useState<Kollege | null>(null)
  const [eingehenderAnruf, setEingehenderAnruf] = useState<{ von: string; vonName: string; kanal: string } | null>(null)
  const [anrufFehler, setAnrufFehler] = useState<string | null>(null)

  // Automatische Besprechungsprotokolle (Aufnahme mit Zustimmung + Whisper +
  // Claude, siehe 0023_besprechungsprotokoll.sql).
  const [aufnahmeStatus, setAufnahmeStatus] = useState<AufnahmeStatus>('keine')
  const [eingehendeAufnahmeAnfrage, setEingehendeAufnahmeAnfrage] = useState<{ besprechungId: string } | null>(null)
  const [aufnahmeFehler, setAufnahmeFehler] = useState<string | null>(null)
  const [besprechungen, setBesprechungen] = useState<Besprechung[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const aufnahmeChunksRef = useRef<Blob[]>([])
  const aufnahmeMimeTypRef = useRef<string>('audio/webm')

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

  // ---- Live-Übersetzung (DeepL, per Edge Function) ----
  async function nachrichtUebersetzen(nachricht: Nachricht) {
    const cacheKey = `${nachricht.id}-${zielsprache}`
    if (uebersetzungen[cacheKey]) return
    setUebersetztWird(nachricht.id)
    setUebersetzungsFehler(null)
    const { data, error } = await supabase.functions.invoke('uebersetzen', {
      body: { text: nachricht.text, zielsprache },
    })
    setUebersetztWird(null)
    if (error || data?.fehler) {
      setUebersetzungsFehler('Übersetzung fehlgeschlagen. Sind die Supabase-Secrets korrekt hinterlegt?')
      return
    }
    setUebersetzungen((bisher) => ({ ...bisher, [cacheKey]: data.text }))
  }

  // ---- KI-To-Do-Vorschläge (Anthropic, per Edge Function) ----
  async function vorschlaegeLaden_() {
    setVorschlaegeLaden(true)
    setVorschlaegeFehler(null)
    setVorschlaege(null)
    const { data, error } = await supabase.functions.invoke('ki-todos', { body: { projektId } })
    setVorschlaegeLaden(false)
    if (error || data?.fehler) {
      setVorschlaegeFehler('Vorschläge konnten nicht erstellt werden. Sind die Supabase-Secrets korrekt hinterlegt?')
      return
    }
    setVorschlaege(data.vorschlaege ?? [])
    setAusgewaehlteVorschlaege(new Set((data.vorschlaege ?? []).map((_: unknown, i: number) => i)))
  }

  function vorschlagUmschalten(index: number) {
    setAusgewaehlteVorschlaege((bisher) => {
      const neu = new Set(bisher)
      if (neu.has(index)) neu.delete(index)
      else neu.add(index)
      return neu
    })
  }

  async function vorschlaegeUebernehmen() {
    if (!vorschlaege || ausgewaehlteVorschlaege.size === 0) return
    setUebernahmeLaeuft(true)
    const auszuUebernehmen = vorschlaege.filter((_, i) => ausgewaehlteVorschlaege.has(i))
    await supabase.from('aufgaben').insert(
      auszuUebernehmen.map((v) => ({ projekt_id: projektId, titel: v.titel, beschreibung: v.beschreibung ?? null }))
    )
    setUebernahmeLaeuft(false)
    setVorschlaege(null)
  }

  // ---- Videotelefonie ----

  function aufraeumen() {
    // Eine laufende Aufzeichnung wird beim Auflegen (egal von welcher
    // Seite) noch fertig gestoppt - der onstop-Handler lädt sie hoch und
    // stößt die Transkription an, unabhängig vom Anruf-Kanal.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
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
    setEingehendeAufnahmeAnfrage(null)
  }

  // ---- Automatische Besprechungsprotokolle ----
  // Startet nur, wenn BEIDE Seiten ausdrücklich zustimmen (Signal-
  // Handshake unten) - unangekündigtes Mitschneiden eines nichtöffentlich
  // gesprochenen Worts ist in Deutschland nach § 201 StGB strafbar. Jede
  // Seite nimmt nur ihre eigene Tonspur auf; die Edge Function fügt beide
  // Aufnahmen anhand ihrer Zeitstempel zu einem Gesprächsverlauf zusammen.
  async function besprechungenLaden() {
    const { data } = await supabase
      .from('besprechungen')
      .select('id, status, protokoll, erstellt_am')
      .eq('projekt_id', projektId)
      .order('erstellt_am', { ascending: false })
    setBesprechungen((data ?? []) as unknown as Besprechung[])
  }

  async function aufnahmeAnfragen() {
    if (!gegenueber || !meineId) return
    setAufnahmeFehler(null)
    const neueBesprechungId = crypto.randomUUID()
    const { error } = await supabase.from('besprechungen').insert({
      id: neueBesprechungId,
      projekt_id: projektId,
      gestartet_von: meineId,
      teilnehmer: [meineId, gegenueber.nutzer_id],
      status: 'angefragt',
    })
    if (error) { setAufnahmeFehler('Anfrage konnte nicht gestellt werden.'); return }
    setAufnahmeStatus('anfrage_gesendet')
    callChannelRef.current?.send({
      type: 'broadcast', event: 'signal',
      payload: { typ: 'aufnahme_anfrage', besprechungId: neueBesprechungId },
    })
  }

  async function aufnahmeStarten(besprechungId: string) {
    const stream = localStreamRef.current
    if (!stream) return
    try {
      const audioStream = new MediaStream(stream.getAudioTracks())
      // Safari/Chrome unterstützen unterschiedliche Aufnahmeformate (webm
      // vs. mp4) - das tatsächlich unterstützte Format wird erkannt und
      // mit hochgeladen, statt pauschal "webm" anzunehmen, damit Whisper
      // die Datei später korrekt dekodieren kann.
      const unterstuetzterTyp = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t))
      const recorder = unterstuetzterTyp ? new MediaRecorder(audioStream, { mimeType: unterstuetzterTyp }) : new MediaRecorder(audioStream)
      aufnahmeMimeTypRef.current = recorder.mimeType || unterstuetzterTyp || 'audio/webm'
      aufnahmeChunksRef.current = []
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) aufnahmeChunksRef.current.push(ev.data) }
      recorder.onstop = () => { aufnahmeHochladenUndTranskribieren(besprechungId) }
      recorder.start()
      mediaRecorderRef.current = recorder
      setAufnahmeStatus('laeuft')
      setEingehendeAufnahmeAnfrage(null)
    } catch {
      setAufnahmeFehler('Aufzeichnung konnte nicht gestartet werden.')
    }
  }

  async function aufnahmeZustimmen() {
    if (!eingehendeAufnahmeAnfrage) return
    const { besprechungId } = eingehendeAufnahmeAnfrage
    await supabase.from('besprechungen').update({ status: 'laeuft' }).eq('id', besprechungId)
    callChannelRef.current?.send({
      type: 'broadcast', event: 'signal',
      payload: { typ: 'aufnahme_start_ok', besprechungId },
    })
    await aufnahmeStarten(besprechungId)
  }

  function aufnahmeAblehnen() {
    const besprechungId = eingehendeAufnahmeAnfrage?.besprechungId
    setEingehendeAufnahmeAnfrage(null)
    callChannelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { typ: 'aufnahme_abgelehnt' } })
    if (besprechungId) supabase.from('besprechungen').delete().eq('id', besprechungId)
  }

  function aufnahmeBeenden(sendeSignal = true) {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (sendeSignal) {
      callChannelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { typ: 'aufnahme_ende' } })
    }
  }

  async function aufnahmeHochladenUndTranskribieren(besprechungId: string) {
    const chunks = aufnahmeChunksRef.current
    aufnahmeChunksRef.current = []
    mediaRecorderRef.current = null
    setAufnahmeStatus('keine')
    if (chunks.length === 0 || !meineId) return
    const mimeType = aufnahmeMimeTypRef.current
    const endung = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm'
    const blob = new Blob(chunks, { type: mimeType })
    const pfad = `${besprechungId}/${meineId}.${endung}`
    const { error: uploadFehler } = await supabase.storage.from('besprechungsaufnahmen').upload(pfad, blob, {
      contentType: mimeType,
      upsert: true,
    })
    if (uploadFehler) { setAufnahmeFehler('Aufnahme konnte nicht hochgeladen werden.'); return }
    await supabase.from('besprechungsaufnahmen').insert({ besprechung_id: besprechungId, sprecher_id: meineId, datei_pfad: pfad })
    await supabase.functions.invoke('besprechung-protokoll', { body: { besprechungId } })
    besprechungenLaden()
  }

  async function beschluesseUebernehmen(beschluesse: { text: string }[]) {
    await supabase.from('aufgaben').insert(beschluesse.map((b) => ({ projekt_id: projektId, titel: b.text })))
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
      } else if (payload.typ === 'aufnahme_anfrage') {
        setEingehendeAufnahmeAnfrage({ besprechungId: payload.besprechungId })
      } else if (payload.typ === 'aufnahme_start_ok') {
        aufnahmeStarten(payload.besprechungId)
      } else if (payload.typ === 'aufnahme_abgelehnt') {
        setAufnahmeStatus('keine')
        setAufnahmeFehler('Die Gegenseite hat die Aufzeichnung abgelehnt.')
      } else if (payload.typ === 'aufnahme_ende') {
        aufnahmeBeenden(false)
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
      } else if (payload.typ === 'aufnahme_anfrage') {
        setEingehendeAufnahmeAnfrage({ besprechungId: payload.besprechungId })
      } else if (payload.typ === 'aufnahme_start_ok') {
        aufnahmeStarten(payload.besprechungId)
      } else if (payload.typ === 'aufnahme_abgelehnt') {
        setAufnahmeStatus('keine')
        setAufnahmeFehler('Die Gegenseite hat die Aufzeichnung abgelehnt.')
      } else if (payload.typ === 'aufnahme_ende') {
        aufnahmeBeenden(false)
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
    if (aufnahmeStatus === 'laeuft') aufnahmeBeenden()
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

  useEffect(() => { besprechungenLaden() }, [projektId])

  useEffect(() => () => { aufraeumen() }, [])

  const nachrichtenSortiert = useMemo(() => nachrichten, [nachrichten])

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...karteStil, padding: 0, display: 'flex', flexDirection: 'column', height: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Übersetzen nach</span>
              <select
                value={zielsprache}
                onChange={(e) => setZielsprache(e.target.value)}
                style={{ ...eingabeStil, padding: '4px 8px', fontSize: 12, width: 'auto' }}
              >
                {SPRACHEN.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </div>
            <button
              onClick={vorschlaegeLaden_}
              disabled={vorschlaegeLaden}
              style={{ ...knopfSekundaerStil, padding: '4px 10px', fontSize: 12 }}
            >
              {vorschlaegeLaden ? 'Erstelle Vorschläge …' : '🤖 KI-To-Dos vorschlagen'}
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
            {ladeStatus === 'bereit' && nachrichtenSortiert.length === 0 && (
              <p style={{ color: 'var(--ink-faint)' }}>Noch keine Nachrichten – schreib die erste.</p>
            )}
            {nachrichtenSortiert.map((n) => {
              const eigene = n.autor_id === meineId
              const uebersetzung = uebersetzungen[`${n.id}-${zielsprache}`]
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
                  {uebersetzung && (
                    <div style={{ maxWidth: '75%', fontSize: 12, fontStyle: 'italic', color: 'var(--ink-faint)', marginTop: 2 }}>
                      {uebersetzung}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 9.5, color: 'var(--ink-faint)' }}>
                      {new Date(n.erstellt_am).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!uebersetzung && (
                      <button
                        onClick={() => nachrichtUebersetzen(n)}
                        disabled={uebersetztWird === n.id}
                        title={`Nach ${SPRACHEN.find((s) => s.code === zielsprache)?.label ?? zielsprache} übersetzen`}
                        style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--ink-faint)' }}
                      >
                        {uebersetztWird === n.id ? '…' : '🌐 übersetzen'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={listeEndeRef} />
          </div>
          {uebersetzungsFehler && (
            <p style={{ fontSize: 11.5, color: 'var(--red)', padding: '0 14px', margin: 0 }}>{uebersetzungsFehler}</p>
          )}
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
          Nachrichten bleiben hier dauerhaft gespeichert, statt in WhatsApp zu verschwinden. Über „🌐 übersetzen" wird
          jede Nachricht live in die oben gewählte Sprache übersetzt (DeepL), und „🤖 KI-To-Dos vorschlagen" liest den
          bisherigen Verlauf und schlägt Aufgaben vor, die du vor der Übernahme prüfen und auswählen kannst (Claude).
        </p>

        {besprechungen.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Besprechungsprotokolle
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {besprechungen.map((b) => (
                <div key={b.id} style={karteStil}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                      {new Date(b.erstellt_am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {b.status !== 'transkribiert' && (
                      <span style={{ fontSize: 11.5, color: b.status === 'fehler' ? 'var(--red)' : 'var(--ink-faint)' }}>
                        {b.status === 'wird_transkribiert' ? 'Wird transkribiert …' : b.status === 'fehler' ? 'Transkription fehlgeschlagen' : 'Läuft …'}
                      </span>
                    )}
                  </div>
                  {b.protokoll && (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.5 }}>{b.protokoll.zusammenfassung}</p>
                      {b.protokoll.themen.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', marginBottom: 4 }}>Themen</div>
                          <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12.5 }}>
                            {b.protokoll.themen.map((t, i) => (
                              <li key={i}>{t.titel}{t.notiz ? ` – ${t.notiz}` : ''}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {b.protokoll.beschluesse.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', marginBottom: 4 }}>Beschlüsse</div>
                          <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12.5 }}>
                            {b.protokoll.beschluesse.map((be, i) => <li key={i}>{be.text}</li>)}
                          </ul>
                          <button
                            onClick={() => beschluesseUebernehmen(b.protokoll!.beschluesse)}
                            style={{ ...knopfSekundaerStil, fontSize: 11.5, padding: '5px 10px' }}
                          >
                            Als Aufgaben übernehmen
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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
          {anrufStatus === 'verbunden' && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {aufnahmeStatus === 'keine' && (
                <button onClick={aufnahmeAnfragen} style={{ ...knopfSekundaerStil, fontSize: 11.5, padding: '6px 10px' }}>
                  ⏺ Aufzeichnen &amp; protokollieren
                </button>
              )}
              {aufnahmeStatus === 'anfrage_gesendet' && (
                <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>Warte auf Zustimmung der Gegenseite …</span>
              )}
              {aufnahmeStatus === 'laeuft' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--red)', fontWeight: 700 }}>● Aufzeichnung läuft</span>
                  <button onClick={() => aufnahmeBeenden()} style={{ ...knopfSekundaerStil, fontSize: 11, padding: '4px 8px' }}>
                    Beenden
                  </button>
                </div>
              )}
              {aufnahmeFehler && <span style={{ fontSize: 11, color: 'var(--red)' }}>{aufnahmeFehler}</span>}
            </div>
          )}
        </div>
      )}

      {eingehendeAufnahmeAnfrage && (
        <div style={{ ...karteStil, position: 'fixed', bottom: 24, right: 340, zIndex: 55, display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 18px', maxWidth: 280 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
            {gegenueber?.vollname ?? 'Die Gegenseite'} möchte dieses Gespräch aufzeichnen und automatisch protokollieren lassen.
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            Die Aufnahme wird nur zur Transkription verwendet und danach gelöscht - nur das Text-Protokoll bleibt erhalten.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={knopfStil} onClick={aufnahmeZustimmen}>Zustimmen</button>
            <button style={knopfSekundaerStil} onClick={aufnahmeAblehnen}>Ablehnen</button>
          </div>
        </div>
      )}
    {(vorschlaegeLaden || vorschlaege !== null || vorschlaegeFehler) && (
        <div style={{ ...karteStil, position: 'fixed', top: 80, right: 24, zIndex: 60, padding: 16, width: 340, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>KI-To-Do-Vorschläge</span>
            <button
              onClick={() => { setVorschlaege(null); setVorschlaegeFehler(null) }}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--ink-faint)' }}
            >
              ✕
            </button>
          </div>
          {vorschlaegeLaden && <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Claude liest den Gesprächsverlauf …</p>}
          {vorschlaegeFehler && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{vorschlaegeFehler}</p>}
          {vorschlaege && vorschlaege.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Keine konkreten Aufgaben im bisherigen Gespräch gefunden.</p>
          )}
          {vorschlaege && vorschlaege.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {vorschlaege.map((v, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={ausgewaehlteVorschlaege.has(i)}
                      onChange={() => vorschlagUmschalten(i)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong>{v.titel}</strong>
                      {v.beschreibung && <span style={{ display: 'block', color: 'var(--ink-faint)', fontSize: 11.5 }}>{v.beschreibung}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={vorschlaegeUebernehmen}
                disabled={ausgewaehlteVorschlaege.size === 0 || uebernahmeLaeuft}
                style={{ ...knopfStil, width: '100%' }}
              >
                {uebernahmeLaeuft ? 'Übernehme …' : `${ausgewaehlteVorschlaege.size} Aufgabe(n) übernehmen`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
