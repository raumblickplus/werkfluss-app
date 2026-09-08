import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export type Firma = { id: string; name: string; rolle: string }

// Ein Bauherr ohne eigene Firma ist über projekt_mitglieder (firma_id = null,
// nutzer_id = die eigene) mit einem oder mehreren Projekten verknüpft, statt
// über firma_mitglieder wie alle professionellen Rollen.
export type BauherrProjekt = { id: string; name: string; adresse: string | null }

type AuthContextValue = {
  session: Session | null
  ladeStatus: 'laedt' | 'bereit'
  firmen: Firma[]
  aktivFirma: Firma | null
  bauherrProjekte: BauherrProjekt[]
  setAktivFirmaId: (id: string) => void
  ladeFirmen: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit'>('laedt')
  const [firmen, setFirmen] = useState<Firma[]>([])
  const [aktivFirmaId, setAktivFirmaId] = useState<string | null>(null)
  const [bauherrProjekte, setBauherrProjekte] = useState<BauherrProjekt[]>([])

  async function ladeFirmen() {
    const { data, error } = await supabase
      .from('firma_mitglieder')
      .select('rolle, firmen(id, name)')

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Firmen konnten nicht geladen werden:', error.message)
      return
    }

    const geladen: Firma[] = (data ?? [])
      .map((eintrag) => {
        const firma = eintrag.firmen as unknown as { id: string; name: string } | null
        if (!firma) return null
        return { id: firma.id, name: firma.name, rolle: eintrag.rolle as string }
      })
      .filter((f): f is Firma => f !== null)

    setFirmen(geladen)
    if (geladen.length > 0 && !aktivFirmaId) {
      setAktivFirmaId(geladen[0].id)
    }
  }

  // Lädt die Projekte, in denen die Person als Bauherr (ohne eigene Firma)
  // Mitglied ist - unabhängig davon, ob sie daneben auch noch echte Firmen
  // hat. Explizit auf die eigene nutzer_id gefiltert: die Select-Policy auf
  // projekt_mitglieder erlaubt allen Projektbeteiligten das Lesen aller
  // Mitgliederzeilen eines Projekts, sonst würde z.B. ein GU hier fälschlich
  // die Bauherr-Zeile seines eigenen Kunden zu sehen bekommen.
  async function ladeBauherrProjekte(nutzerId: string) {
    const { data, error } = await supabase
      .from('projekt_mitglieder')
      .select('projekte(id, name, adresse)')
      .eq('rolle_im_projekt', 'bauherr')
      .eq('nutzer_id', nutzerId)

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Bauherr-Projekte konnten nicht geladen werden:', error.message)
      return
    }

    const geladen: BauherrProjekt[] = (data ?? [])
      .map((eintrag) => eintrag.projekte as unknown as BauherrProjekt | null)
      .filter((p): p is BauherrProjekt => p !== null)

    setBauherrProjekte(geladen)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLadeStatus('bereit')
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, neueSession) => {
      setSession(neueSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      ladeFirmen()
      ladeBauherrProjekte(session.user.id)
    } else {
      setFirmen([])
      setAktivFirmaId(null)
      setBauherrProjekte([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const aktivFirma = firmen.find((f) => f.id === aktivFirmaId) ?? null

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, ladeStatus, firmen, aktivFirma, bauherrProjekte, setAktivFirmaId, ladeFirmen, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden')
  return ctx
}
