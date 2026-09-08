import { useEffect, useRef, useState, type FormEvent } from 'react'
import AppShell from '../components/AppShell'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { eingabeStil, knopfStil, karteStil } from './stil'

type Nachricht = {
  id: string
  autor_id: string | null
  text: string
  erstellt_am: string
  profil: string | null
}

// Firmen-interner Chat, unabhängig von einzelnen Projekten - für die
// Kolleg:innen der eigenen Firma (GU, Handwerksbetrieb oder Architekturbüro
// gleichermaßen). Der projektbezogene Chat mit Videotelefonie/Übersetzung/
// KI-To-Dos bleibt im jeweiligen Projekt-Tab "Kommunikation"; hier geht es
// nur um die eigene interne Abstimmung, unabhängig davon, an welchen
// Projekten die Firma gerade beteiligt ist.
export default function TeamChat() {
  const { session, aktivFirma } = useAuth()
  const meineId = session?.user?.id ?? null

  const [nachrichten, setNachrichten] = useState<Nachricht[]>([])
  const [text, setText] = useState('')
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const listeEndeRef = useRef<HTMLDivElement>(null)

  async function laden() {
    if (!aktivFirma) return
    setLadeStatus('laedt')
    const { data } = await supabase
      .from('firma_nachrichten')
      .select('id, autor_id, text, erstellt_am, profile(vollname)')
      .eq('firma_id', aktivFirma.id)
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
    laden()
    if (!aktivFirma) return
    const kanal = supabase
      .channel(`firma-chat-${aktivFirma.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'firma_nachrichten', filter: `firma_id=eq.${aktivFirma.id}` },
        () => laden()
      )
      .subscribe()
    return () => { supabase.removeChannel(kanal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivFirma?.id])

  useEffect(() => {
    listeEndeRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nachrichten])

  async function senden(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || !meineId || !aktivFirma) return
    const inhalt = text.trim()
    setText('')
    await supabase.from('firma_nachrichten').insert({ firma_id: aktivFirma.id, autor_id: meineId, text: inhalt })
  }

  return (
    <AppShell title="Team-Chat" subtitle={aktivFirma ? `Nur für Kolleg:innen bei ${aktivFirma.name} sichtbar` : undefined}>
      <div style={{ ...karteStil, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 210px)', minHeight: 360, padding: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ladeStatus === 'laedt' && nachrichten.length === 0 && (
            <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Lädt …</p>
          )}
          {ladeStatus === 'bereit' && nachrichten.length === 0 && (
            <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>
              Noch keine Nachrichten – schreib die erste interne Nachricht an dein Team.
            </p>
          )}
          {nachrichten.map((n) => {
            const eigene = n.autor_id === meineId
            return (
              <div key={n.id} style={{ alignSelf: eigene ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                {!eigene && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-faint)', marginBottom: 2 }}>
                    {n.profil ?? 'Unbekannt'}
                  </div>
                )}
                <div
                  style={{
                    background: eigene ? 'var(--orange-text)' : 'var(--surface-2, #f2efe6)',
                    color: eigene ? '#fff' : 'inherit',
                    borderRadius: 12,
                    padding: '9px 13px',
                    fontSize: 13.5,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {n.text}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 2, textAlign: eigene ? 'right' : 'left' }}>
                  {new Date(n.erstellt_am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })}
          <div ref={listeEndeRef} />
        </div>
        <form onSubmit={senden} style={{ display: 'flex', gap: 10, padding: '14px 16px', borderTop: '1px solid var(--linie, rgba(0,0,0,.08))' }}>
          <input
            style={{ ...eingabeStil, flex: 1 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nachricht an dein Team …"
          />
          <button type="submit" style={knopfStil} disabled={!text.trim()}>Senden</button>
        </form>
      </div>
    </AppShell>
  )
}
