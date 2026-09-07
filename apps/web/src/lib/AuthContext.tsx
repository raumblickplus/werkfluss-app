import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export type Firma = { id: string; name: string; rolle: string }

type AuthContextValue = {
  session: Session | null
  ladeStatus: 'laedt' | 'bereit'
  firmen: Firma[]
  aktivFirma: Firma | null
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
    } else {
      setFirmen([])
      setAktivFirmaId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const aktivFirma = firmen.find((f) => f.id === aktivFirmaId) ?? null

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, ladeStatus, firmen, aktivFirma, setAktivFirmaId, ladeFirmen, signOut }}
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
