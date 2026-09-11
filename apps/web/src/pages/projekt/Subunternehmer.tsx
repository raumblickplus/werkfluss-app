import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../lib/AuthContext'
import { eingabeStil, knopfStil, karteStil } from '../stil'

// Subunternehmer-Übersicht (Julian-Backlog 10.09.2026, Teil 1: "Sowohl der
// Generalunternehmer als auch jeder Handwerksbetrieb, der selbst mit
// Subunternehmern arbeitet, soll eine eigene Übersicht/Spalte seiner
// Subunternehmer bekommen - nicht nur GU-exklusiv"). Zeigt jeder Firma
// genau die Aufträge, die SIE SELBST in diesem Projekt vergeben hat
// (auftraggeber_firma_id = eigene Firma, Migration 0055) - für den
// Projekteigentümer meist identisch mit den über Ausschreibung/Angebote
// vergebenen Aufträgen, für eine beauftragte Handwerksfirma die eigenen,
// zusätzlich vergebenen Subunternehmer-Aufträge.
//
// Bewusst als einfaches Direktformular (Firma + Summe) statt über eine
// eigene Ausschreibung mit Angebotsvergleich - die LV-/Ausschreibungs-
// Pipeline (Ausschreibung.tsx) bleibt in dieser Ausbaustufe weiterhin dem
// Projekteigentümer vorbehalten. Auswählbar sind nur Firmen, die bereits
// als "handwerker" am Projekt beteiligt sind (kein neuer Einladungsweg).

type AuftragnehmerOption = { firma_id: string; name: string; gewerk: string | null }

type Auftrag = {
  id: string
  auftragnehmer_firma_id: string
  summe_netto_cents: number
  status: 'aktiv' | 'abgeschlossen' | 'storniert'
  erstellt_am: string
  firmen: { name: string } | null
}

const statusLabel: Record<Auftrag['status'], string> = {
  aktiv: 'Aktiv',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

const statusFarbe: Record<Auftrag['status'], string> = {
  aktiv: 'var(--olive)',
  abgeschlossen: 'var(--ink-dim)',
  storniert: 'var(--ink-faint)',
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const centsZuEuroText = (cents: number) => euro.format(cents / 100)

export default function Subunternehmer({ projektId }: { projektId: string }) {
  const { aktivFirma } = useAuth()
  const [darfBeauftragen, setDarfBeauftragen] = useState(false)
  const [optionen, setOptionen] = useState<AuftragnehmerOption[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [ladeStatus, setLadeStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)

  const [gewaehlteFirma, setGewaehlteFirma] = useState('')
  const [summeEuro, setSummeEuro] = useState('')

  async function laden() {
    if (!aktivFirma) return
    setLadeStatus('laedt')

    const [{ data: projekt }, { data: mitgliederData }, { data: auftraegeData, error: auftraegeFehler }, { data: eigeneAuftraege }] = await Promise.all([
      supabase.from('projekte').select('firma_id').eq('id', projektId).maybeSingle(),
      supabase.from('projekt_mitglieder').select('firma_id, gewerk, firmen(id, name)').eq('projekt_id', projektId).eq('rolle_im_projekt', 'handwerker'),
      supabase
        .from('auftraege')
        .select('id, auftragnehmer_firma_id, summe_netto_cents, status, erstellt_am, firmen!auftragnehmer_firma_id(name)')
        .eq('projekt_id', projektId)
        .eq('auftraggeber_firma_id', aktivFirma.id)
        .order('erstellt_am', { ascending: false }),
      supabase.from('auftraege').select('id').eq('projekt_id', projektId).eq('auftragnehmer_firma_id', aktivFirma.id).neq('status', 'storniert'),
    ])

    if (auftraegeFehler) { setLadeStatus('fehler'); return }

    // Berechtigung fürs Formular clientseitig vorwegnehmen (dieselbe Regel
    // wie die RLS-Policy "Aufträge anlegen", 0055): entweder ist die eigene
    // Firma der Projekteigentümer, oder sie hat in diesem Projekt bereits
    // selbst einen laufenden Auftrag erhalten.
    const istEigentuemer = projekt?.firma_id === aktivFirma.id
    const hatEigenenAuftrag = (eigeneAuftraege ?? []).length > 0
    setDarfBeauftragen(istEigentuemer || hatEigenenAuftrag)

    const opts = (mitgliederData ?? [])
      .filter((m: any) => m.firma_id !== aktivFirma.id && m.firmen)
      .map((m: any) => ({ firma_id: m.firma_id, name: m.firmen.name as string, gewerk: m.gewerk as string | null }))
    setOptionen(opts)
    setAuftraege((auftraegeData ?? []) as unknown as Auftrag[])
    setLadeStatus('bereit')
  }

  useEffect(() => { laden() }, [projektId, aktivFirma?.id])

  async function beauftragen(e: FormEvent) {
    e.preventDefault()
    if (!aktivFirma || !gewaehlteFirma) return
    setFehler(null)
    const summeCents = Math.round(parseFloat(summeEuro.replace(',', '.')) * 100)
    if (Number.isNaN(summeCents) || summeCents <= 0) { setFehler('Bitte eine gültige Summe eingeben.'); return }

    setSpeichert(true)

    // Freigabelimit vorab prüfen (wie in Angebote.tsx/auftragErstellen) -
    // verständliche Meldung statt der rohen RLS-Fehlermeldung.
    if (aktivFirma.rolle !== 'inhaber' && aktivFirma.rolle !== 'geschaeftsfuehrung') {
      const { data: eigeneMitgliedschaft } = await supabase
        .from('firma_mitglieder')
        .select('freigabe_limit_cents')
        .eq('firma_id', aktivFirma.id)
        .eq('nutzer_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle()
      const limit = eigeneMitgliedschaft?.freigabe_limit_cents ?? null
      if (limit == null || limit < summeCents) {
        setFehler(
          limit == null
            ? 'Für dich ist kein Freigabelimit hinterlegt – bitte einen Inhaber/eine Geschäftsführung um Freigabe bitten (Team-Seite).'
            : `Dieser Betrag (${centsZuEuroText(summeCents)}) übersteigt dein Freigabelimit von ${centsZuEuroText(limit)}.`
        )
        setSpeichert(false)
        return
      }
    }

    const { error } = await supabase.from('auftraege').insert({
      projekt_id: projektId,
      auftraggeber_firma_id: aktivFirma.id,
      auftragnehmer_firma_id: gewaehlteFirma,
      summe_netto_cents: summeCents,
    })

    if (error) {
      setFehler(
        error.message.includes('row-level security')
          ? 'Auftrag konnte nicht erstellt werden – entweder reicht dein Freigabelimit nicht aus, oder deine Firma hat in diesem Projekt noch keinen eigenen Auftrag erhalten.'
          : `Beauftragung fehlgeschlagen: ${error.message}`
      )
      setSpeichert(false)
      return
    }

    setGewaehlteFirma(''); setSummeEuro(''); setZeigeFormular(false); setSpeichert(false)
    laden()
  }

  async function statusAendern(id: string, status: Auftrag['status']) {
    await supabase.from('auftraege').update({ status }).eq('id', id)
    laden()
  }

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--ink-faint)' }}>
        Hier siehst du die Subunternehmer, die deine Firma in diesem Projekt selbst beauftragt hat –
        unabhängig davon, ob deine Firma der Projekteigentümer ist oder selbst als Handwerksbetrieb mitarbeitet.
      </p>

      {fehler && (
        <div style={{ ...karteStil, marginBottom: 16, padding: '12px 16px', borderColor: 'var(--red)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>{fehler}</p>
        </div>
      )}

      {ladeStatus === 'bereit' && !darfBeauftragen && (
        <div style={{ ...karteStil, marginBottom: 16, padding: '12px 16px' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-dim)' }}>
            Deine Firma muss in diesem Projekt zunächst selbst einen Auftrag erhalten haben, bevor sie
            eigene Subunternehmer beauftragen kann.
          </p>
        </div>
      )}

      {darfBeauftragen && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button style={knopfStil} onClick={() => setZeigeFormular((v) => !v)} disabled={optionen.length === 0}>
            {zeigeFormular ? 'Abbrechen' : '+ Subunternehmer beauftragen'}
          </button>
        </div>
      )}

      {darfBeauftragen && optionen.length === 0 && ladeStatus === 'bereit' && (
        <p style={{ color: 'var(--ink-faint)', fontSize: 12.5 }}>
          Keine weiteren Handwerksfirmen im Projekt gefunden, die du beauftragen könntest.
        </p>
      )}

      {zeigeFormular && (
        <form onSubmit={beauftragen} style={{ ...karteStil, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Firma
            <select style={eingabeStil} value={gewaehlteFirma} onChange={(e) => setGewaehlteFirma(e.target.value)} required>
              <option value="">– auswählen –</option>
              {optionen.map((o) => (
                <option key={o.firma_id} value={o.firma_id}>{o.name}{o.gewerk ? ` · ${o.gewerk}` : ''}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-dim)' }}>
            Summe netto (€)
            <input style={eingabeStil} value={summeEuro} onChange={(e) => setSummeEuro(e.target.value)} required placeholder="z.B. 4500" />
          </label>
          <button type="submit" style={knopfStil} disabled={speichert}>{speichert ? 'Speichert …' : 'Beauftragen'}</button>
        </form>
      )}

      {ladeStatus === 'laedt' && <p style={{ color: 'var(--ink-faint)' }}>Lädt …</p>}
      {ladeStatus === 'fehler' && <p style={{ color: 'var(--red)' }}>Konnte nicht geladen werden.</p>}
      {ladeStatus === 'bereit' && auftraege.length === 0 && (
        <p style={{ color: 'var(--ink-faint)' }}>Deine Firma hat in diesem Projekt noch keine Subunternehmer beauftragt.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {auftraege.map((a) => (
          <div key={a.id} style={{ ...karteStil, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{a.firmen?.name ?? 'Unbekannte Firma'}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginTop: 2 }}>{centsZuEuroText(a.summe_netto_cents)} netto</div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>
                  Beauftragt am {new Date(a.erstellt_am).toLocaleDateString('de-DE')}
                </div>
              </div>
              <select
                style={{ ...eingabeStil, fontSize: 13, padding: '6px 10px', color: statusFarbe[a.status] }}
                value={a.status}
                onChange={(e) => statusAendern(a.id, e.target.value as Auftrag['status'])}
              >
                {Object.entries(statusLabel).map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      <p className="footnote">
        Beauftragt werden können nur Firmen, die bereits als Handwerksbetrieb an diesem Projekt beteiligt sind –
        eine bisher unbeteiligte Firma neu ins Projekt einzuladen ist bewusst nicht Teil dieser Übersicht
        (das betrifft den bestehenden Einladungsmechanismus und ist ein eigener Ausbauschritt). Eine eigene
        Ausschreibung mit Angebotsvergleich für Subunternehmer ist ebenfalls bewusst nicht Teil dieser
        Ausbaustufe – die Beauftragung erfolgt direkt mit fest eingegebener Summe. Rechnungsstellung zwischen
        zwei nicht-Generalunternehmer-Firmen läuft weiterhin außerhalb der App.
      </p>
    </div>
  )
}
