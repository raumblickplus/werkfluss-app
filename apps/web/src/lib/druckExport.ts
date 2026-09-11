// Druckbare Dokumente (Rechnungen, Angebote) als PDF (Julian-Feedback:
// "PDF-Export für Rechnungen/Angebote" - Konzept Abschnitt 8.2). Bewusst
// ohne PDF-Bibliothek (jsPDF o.ä.) umgesetzt: dieses Projekt hat keinen
// Zugriff auf die npm-Registry (Sicherheitsrichtlinie blockt registry.npmjs.org),
// eine neue Abhängigkeit ließe sich also gar nicht installieren. Stattdessen
// öffnet sich ein neues Fenster mit einer sauber gestalteten Druckvorlage,
// die über den normalen Browser-Druckdialog ("Als PDF sichern", auf dem Mac
// direkt im Drucken-Menü) gespeichert wird - funktioniert offline, ohne
// Abhängigkeit, in jedem Browser.

export type DruckFirma = {
  name: string
  rechtsform: string | null
  adresse: string | null
  ust_id: string | null
  telefon: string | null
  email: string | null
  iban: string | null
}

export type DruckPosition = {
  kurztext: string
  menge: number | null
  einheit: string | null
  einzelpreis_cents: number | null
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const centsZuEuro = (cents: number) => euro.format(cents / 100)
const datumDe = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '–')

function firmenkopf(firma: DruckFirma) {
  const kontaktzeile = [firma.telefon, firma.email].filter(Boolean).join(' · ')
  return `
    <div class="von">
      <div class="von-name">${escapeHtml(firma.name)}${firma.rechtsform ? ` ${escapeHtml(firma.rechtsform)}` : ''}</div>
      ${firma.adresse ? `<div>${escapeHtml(firma.adresse)}</div>` : ''}
      ${kontaktzeile ? `<div>${escapeHtml(kontaktzeile)}</div>` : ''}
      ${firma.ust_id ? `<div>USt-IdNr. ${escapeHtml(firma.ust_id)}</div>` : ''}
    </div>
  `
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function grundgeruest(titel: string, inhalt: string) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(titel)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    color: #1c1c1a;
    margin: 0;
    padding: 48px 56px;
    font-size: 13px;
    line-height: 1.5;
  }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .von-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
  .dok-titel { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; text-align: right; }
  .dok-meta { text-align: right; color: #55554f; margin-top: 6px; }
  .an { margin-bottom: 32px; }
  .an-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #8a897f; margin-bottom: 4px; }
  .an-name { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { text-align: left; padding: 8px 6px; font-size: 12.5px; }
  thead th { border-bottom: 2px solid #1c1c1a; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; color: #55554f; }
  tbody tr { border-bottom: 1px solid #e4e2d8; }
  td.zahl, th.zahl { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .summenblock { margin-left: auto; width: 280px; margin-top: 16px; }
  .summenblock div { display: flex; justify-content: space-between; padding: 4px 0; }
  .summenblock .brutto { border-top: 2px solid #1c1c1a; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 15px; }
  .fussnote { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e4e2d8; font-size: 11px; color: #8a897f; }
  @media print {
    body { padding: 0 32px; }
    @page { margin: 24mm 18mm; }
  }
</style>
</head>
<body>
${inhalt}
</body>
</html>`
}

// Bugfix (12.09.2026, Julian-Meldung "PDF-Export funktioniert nicht"):
// window.open() muss synchron im Klick-Handler passieren, sonst werten
// Safari/Chrome den Aufruf nicht mehr als direkte Reaktion auf eine
// Nutzer-Interaktion und blocken das Fenster stillschweigend (kein Fehler,
// einfach nichts sichtbares) - das passierte in Angebote.tsx, wo vor dem
// window.open() erst asynchron Firma/Positionen nachgeladen wurden. Fix:
// das Fenster wird jetzt IMMER zuerst sofort geöffnet (mit einer
// "Lädt..."-Zwischenseite), der eigentliche Inhalt kommt erst danach rein,
// sobald er fertig ist - so bleibt der Aufruf auch bei nachgelagertem
// asynchronem Laden im Kontext der Nutzer-Interaktion.
export function druckfensterOeffnen(): Window | null {
  const fenster = window.open('', '_blank', 'width=880,height=1120')
  if (!fenster) {
    alert('Das Druckfenster wurde vom Browser blockiert. Bitte Pop-ups für diese Seite erlauben und den Button erneut anklicken.')
    return null
  }
  fenster.document.open()
  fenster.document.write(grundgeruest('Wird vorbereitet …', '<p style="padding:64px 56px;color:#8a897f;">Dokument wird vorbereitet …</p>'))
  fenster.document.close()
  fenster.focus()
  return fenster
}

export function dokumentInFensterSchreiben(fenster: Window, titel: string, inhalt: string) {
  fenster.document.open()
  fenster.document.write(grundgeruest(titel, inhalt))
  fenster.document.close()
  fenster.focus()
  // Kurze Verzögerung, damit das neue Fenster Layout/Schrift fertig aufgebaut
  // hat, bevor der Druckdialog erscheint - ohne das erscheint auf manchen
  // Browsern eine leere oder halb gerenderte erste Druckseite.
  setTimeout(() => fenster.print(), 350)
}

// Bequemlichkeits-Variante für den Fall, dass Titel und Inhalt schon fertig
// vorliegen (kein asynchrones Nachladen mehr nötig) - öffnet und befüllt in
// einem Aufruf.
export function dokumentDrucken(titel: string, inhalt: string) {
  const fenster = druckfensterOeffnen()
  if (!fenster) return
  dokumentInFensterSchreiben(fenster, titel, inhalt)
}

export function rechnungDruckHtml(params: {
  rechnungsnummer: string
  typLabel: string
  erstelltAm: string
  faelligAm: string | null
  summeNettoCents: number
  mwstSatz: number
  firma: DruckFirma
  projektName: string
  kundeName: string | null
  kundeRechnungsadresse: string | null
  auftragBezeichnung: string | null
}) {
  const {
    rechnungsnummer, typLabel, erstelltAm, faelligAm, summeNettoCents, mwstSatz,
    firma, projektName, kundeName, kundeRechnungsadresse, auftragBezeichnung,
  } = params
  const mwstCents = Math.round(summeNettoCents * (mwstSatz / 100))
  const bruttoCents = summeNettoCents + mwstCents
  const leistungstext = auftragBezeichnung
    ? `${escapeHtml(typLabel)} – ${escapeHtml(auftragBezeichnung)}, Projekt „${escapeHtml(projektName)}"`
    : `${escapeHtml(typLabel)} – Projekt „${escapeHtml(projektName)}"`

  return `
    <div class="kopf">
      ${firmenkopf(firma)}
      <div>
        <div class="dok-titel">RECHNUNG</div>
        <div class="dok-meta">
          Nr. ${escapeHtml(rechnungsnummer)}<br />
          Rechnungsdatum: ${datumDe(erstelltAm)}<br />
          ${faelligAm ? `Fällig am: ${datumDe(faelligAm)}` : 'Fällig sofort ohne Abzug'}
        </div>
      </div>
    </div>

    <div class="an">
      <div class="an-label">Rechnungsempfänger</div>
      <div class="an-name">${escapeHtml(kundeName ?? projektName)}</div>
      ${kundeRechnungsadresse ? `<div>${escapeHtml(kundeRechnungsadresse).replace(/\n/g, '<br />')}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr><th>Leistung</th><th class="zahl">Betrag netto</th></tr>
      </thead>
      <tbody>
        <tr><td>${leistungstext}</td><td class="zahl">${centsZuEuro(summeNettoCents)}</td></tr>
      </tbody>
    </table>

    <div class="summenblock">
      <div><span>Netto</span><span>${centsZuEuro(summeNettoCents)}</span></div>
      <div><span>zzgl. ${mwstSatz}% USt.</span><span>${centsZuEuro(mwstCents)}</span></div>
      <div class="brutto"><span>Gesamtbetrag</span><span>${centsZuEuro(bruttoCents)}</span></div>
    </div>

    <p class="fussnote">
      ${firma.iban ? `Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer auf folgendes Konto: IBAN ${escapeHtml(firma.iban)}, Kontoinhaber ${escapeHtml(firma.name)}.<br />` : ''}
      Diese Rechnung wurde maschinell erstellt und ist ohne Unterschrift gültig. Keine steuerliche oder rechtliche
      Beratung – bei Rückfragen zur Umsatzsteuer wenden Sie sich an Ihre Steuerkanzlei.
    </p>
  `
}

export function angebotDruckHtml(params: {
  angebotsnummer: string
  gewerk: string | null
  erstelltAm: string
  gueltigBis: string | null
  mwstSatz: number
  firma: DruckFirma
  projektName: string
  projektAdresse: string | null
  positionen: DruckPosition[]
  summeNettoCents: number
}) {
  const {
    angebotsnummer, gewerk, erstelltAm, gueltigBis, mwstSatz, firma,
    projektName, projektAdresse, positionen, summeNettoCents,
  } = params
  const mwstCents = Math.round(summeNettoCents * (mwstSatz / 100))
  const bruttoCents = summeNettoCents + mwstCents

  const positionsZeilen = positionen.length > 0
    ? positionen.map((p) => `
        <tr>
          <td>${escapeHtml(p.kurztext)}</td>
          <td class="zahl">${p.menge != null ? `${p.menge} ${p.einheit ?? ''}` : '–'}</td>
          <td class="zahl">${p.einzelpreis_cents != null ? centsZuEuro(p.einzelpreis_cents) : '–'}</td>
          <td class="zahl">${p.menge != null && p.einzelpreis_cents != null ? centsZuEuro(Math.round(p.menge * p.einzelpreis_cents)) : '–'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4">${gewerk ? escapeHtml(gewerk) : 'Bauleistungen gemäß Absprache'}</td></tr>`

  return `
    <div class="kopf">
      ${firmenkopf(firma)}
      <div>
        <div class="dok-titel">ANGEBOT</div>
        <div class="dok-meta">
          Nr. ${escapeHtml(angebotsnummer)}<br />
          Datum: ${datumDe(erstelltAm)}<br />
          ${gueltigBis ? `Gültig bis: ${datumDe(gueltigBis)}` : ''}
        </div>
      </div>
    </div>

    <div class="an">
      <div class="an-label">Angebot für</div>
      <div class="an-name">${escapeHtml(projektName)}${gewerk ? ` · ${escapeHtml(gewerk)}` : ''}</div>
      ${projektAdresse ? `<div>${escapeHtml(projektAdresse)}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr><th>Position</th><th class="zahl">Menge</th><th class="zahl">Einzelpreis</th><th class="zahl">Gesamt</th></tr>
      </thead>
      <tbody>
        ${positionsZeilen}
      </tbody>
    </table>

    <div class="summenblock">
      <div><span>Netto</span><span>${centsZuEuro(summeNettoCents)}</span></div>
      <div><span>zzgl. ${mwstSatz}% USt.</span><span>${centsZuEuro(mwstCents)}</span></div>
      <div class="brutto"><span>Gesamt</span><span>${centsZuEuro(bruttoCents)}</span></div>
    </div>

    <p class="fussnote">
      Dieses Angebot wurde maschinell erstellt und ist freibleibend, sofern keine abweichende Gültigkeit angegeben ist.
      Es stellt kein rechtsverbindliches Vertragsangebot im Sinne einer Bindungsfrist ohne gesonderte Vereinbarung dar.
    </p>
  `
}
