// Druckbare Dokumente (Rechnungen, Angebote, Mahnungen) als PDF
// (Julian-Feedback: erst "PDF-Export für Rechnungen/Angebote", dann
// 12.09.2026 "das generelle Design ... muss gut aussehen ... mit Logo der
// Firma ... mit Optionen anpassbar" - Konzept Abschnitt 8.2). Bewusst ohne
// PDF-Bibliothek (jsPDF o.ä.) umgesetzt: dieses Projekt hat keinen Zugriff
// auf die npm-Registry (Sicherheitsrichtlinie blockt registry.npmjs.org),
// eine neue Abhängigkeit ließe sich also gar nicht installieren.
// Stattdessen öffnet sich ein neues Fenster mit einer sauber gestalteten
// Druckvorlage, die über den normalen Browser-Druckdialog ("Als PDF
// sichern", auf dem Mac direkt im Drucken-Menü) gespeichert wird -
// funktioniert offline, ohne Abhängigkeit, in jedem Browser.
//
// "Optionen anpassbar" (12.09.2026) heißt in dieser ersten Ausbaustufe:
// Firmenlogo (firmen.logo_url, über den bereits bestehenden "logos"-
// Bucket) und eine frei wählbare Akzentfarbe (firmen.akzentfarbe) fließen
// direkt in den generierten Kopf-/Summenblock ein - siehe Einstellungen.tsx.
// Eine volle Vorlagen-Auswahl (mehrere Layouts) ist bewusst nicht Teil
// dieser Ausbaustufe.

export type DruckFirma = {
  name: string
  rechtsform: string | null
  adresse: string | null
  ust_id: string | null
  telefon: string | null
  email: string | null
  iban: string | null
  logo_url?: string | null
  akzentfarbe?: string | null
}

export type DruckPosition = {
  kurztext: string
  menge: number | null
  einheit: string | null
  einzelpreis_cents: number | null
}

const STANDARD_AKZENT = '#C1552F'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const centsZuEuro = (cents: number) => euro.format(cents / 100)
const datumDe = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '–')

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Kleine, konsistente Strich-Icons für die Fußzeile (Adresse/Bank/Steuer) -
// derselbe Stil (currentColor, runde Kappen) wie die Icons im Rest der App.
const ICON_PIN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>'
const ICON_BANK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 10.5V19M9.5 10.5V19M14.5 10.5V19M19 10.5V19"/><path d="M3.5 19h17"/></svg>'
const ICON_HASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16"/></svg>'
const ICON_MAIL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 6.5 8 6 8-6"/></svg>'

function firmenkopf(firma: DruckFirma) {
  const kontaktzeile = [firma.telefon, firma.email].filter(Boolean).join(' · ')
  return `
    <div class="von">
      ${firma.logo_url ? `<img class="logo" src="${escapeHtml(firma.logo_url)}" alt="" />` : ''}
      <div class="von-name">${escapeHtml(firma.name)}${firma.rechtsform ? ` ${escapeHtml(firma.rechtsform)}` : ''}</div>
      ${firma.adresse ? `<div>${escapeHtml(firma.adresse)}</div>` : ''}
      ${kontaktzeile ? `<div>${escapeHtml(kontaktzeile)}</div>` : ''}
      ${firma.ust_id ? `<div>USt-IdNr. ${escapeHtml(firma.ust_id)}</div>` : ''}
    </div>
  `
}

function fusszeile(firma: DruckFirma, zusatz?: string) {
  const bankZeile = firma.iban ? `IBAN ${escapeHtml(firma.iban)}<br />${escapeHtml(firma.name)}` : '–'
  return `
    <div class="fuss-grid">
      <div><div class="fuss-label">${ICON_PIN} Adresse</div><div>${firma.adresse ? escapeHtml(firma.adresse) : escapeHtml(firma.name)}</div></div>
      <div><div class="fuss-label">${ICON_BANK} Bankverbindung</div><div>${bankZeile}</div></div>
      <div><div class="fuss-label">${ICON_HASH} Steuernummer / Kontakt</div><div>${firma.ust_id ? `USt-IdNr. ${escapeHtml(firma.ust_id)}<br />` : ''}${firma.email ? `${ICON_MAIL} ${escapeHtml(firma.email)}` : ''}</div></div>
    </div>
    ${zusatz ? `<p class="fussnote">${zusatz}</p>` : ''}
  `
}

function grundgeruest(titel: string, inhalt: string, akzentfarbe?: string | null) {
  const akzent = akzentfarbe || STANDARD_AKZENT
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(titel)}</title>
<style>
  :root { --akzent: ${akzent}; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    color: #1c1c1a;
    margin: 0;
    padding: 0 56px 48px;
    font-size: 13px;
    line-height: 1.5;
  }
  .markenband { height: 6px; background: var(--akzent); margin: 0 -56px 40px; }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; gap: 24px; }
  .logo { max-height: 46px; max-width: 180px; object-fit: contain; margin-bottom: 12px; display: block; }
  .von-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
  .von { color: #55554f; }
  .dok-titel { font-size: 30px; font-weight: 800; letter-spacing: -0.03em; text-align: right; color: var(--akzent); text-transform: uppercase; }
  .dok-meta { text-align: right; color: #55554f; margin-top: 8px; }
  .an { margin-bottom: 30px; }
  .an-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #8a897f; margin-bottom: 4px; font-weight: 700; }
  .an-name { font-weight: 700; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { text-align: left; padding: 10px 8px; font-size: 12.5px; }
  thead th { border-bottom: 2px solid var(--akzent); font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #55554f; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f7f6f1; }
  tbody tr { border-bottom: 1px solid #e4e2d8; }
  td.zahl, th.zahl { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .zwischensummen { margin-left: auto; width: 280px; margin-top: 14px; }
  .zwischensummen div { display: flex; justify-content: space-between; padding: 4px 0; color: #55554f; }
  .summe-leiste {
    margin-left: auto; margin-top: 14px; width: 280px;
    border-radius: 12px; padding: 16px 20px;
    background: linear-gradient(135deg, var(--akzent), color-mix(in srgb, var(--akzent) 45%, #1c1c1a));
    color: #fff; display: flex; justify-content: space-between; align-items: baseline;
  }
  .summe-leiste .label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; opacity: .85; }
  .summe-leiste .betrag { font-size: 22px; font-weight: 700; }
  .brieftext { white-space: pre-wrap; margin: 8px 0 28px; }
  .fuss-grid { margin-top: 56px; padding-top: 18px; border-top: 1px solid #e4e2d8; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; font-size: 11px; color: #55554f; }
  .fuss-label { display: flex; align-items: center; gap: 6px; font-weight: 700; color: #8a897f; text-transform: uppercase; font-size: 9.5px; letter-spacing: .04em; margin-bottom: 4px; }
  .fuss-label svg { flex-shrink: 0; color: var(--akzent); }
  .fussnote { margin-top: 20px; font-size: 10.5px; color: #8a897f; }
  @media print {
    body { padding: 0 32px 0; }
    .markenband { margin: 0 -32px 32px; }
    @page { margin: 20mm 18mm; }
  }
</style>
</head>
<body>
<div class="markenband"></div>
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
  fenster.document.write(grundgeruest('Wird vorbereitet …', '<p style="padding:64px 0;color:#8a897f;">Dokument wird vorbereitet …</p>'))
  fenster.document.close()
  fenster.focus()
  return fenster
}

export function dokumentInFensterSchreiben(fenster: Window, titel: string, inhalt: string, akzentfarbe?: string | null) {
  fenster.document.open()
  fenster.document.write(grundgeruest(titel, inhalt, akzentfarbe))
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
export function dokumentDrucken(titel: string, inhalt: string, akzentfarbe?: string | null) {
  const fenster = druckfensterOeffnen()
  if (!fenster) return
  dokumentInFensterSchreiben(fenster, titel, inhalt, akzentfarbe)
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
        <div class="dok-titel">Rechnung</div>
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

    <div class="zwischensummen">
      <div><span>Netto</span><span>${centsZuEuro(summeNettoCents)}</span></div>
      <div><span>zzgl. ${mwstSatz}% USt.</span><span>${centsZuEuro(mwstCents)}</span></div>
    </div>
    <div class="summe-leiste">
      <span class="label">Gesamtbetrag</span>
      <span class="betrag">${centsZuEuro(bruttoCents)}</span>
    </div>

    ${fusszeile(firma, 'Diese Rechnung wurde maschinell erstellt und ist ohne Unterschrift gültig. Keine steuerliche oder rechtliche Beratung – bei Rückfragen zur Umsatzsteuer wenden Sie sich an Ihre Steuerkanzlei.')}
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
        <div class="dok-titel">Angebot</div>
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

    <div class="zwischensummen">
      <div><span>Netto</span><span>${centsZuEuro(summeNettoCents)}</span></div>
      <div><span>zzgl. ${mwstSatz}% USt.</span><span>${centsZuEuro(mwstCents)}</span></div>
    </div>
    <div class="summe-leiste">
      <span class="label">Gesamt</span>
      <span class="betrag">${centsZuEuro(bruttoCents)}</span>
    </div>

    ${fusszeile(firma, 'Dieses Angebot wurde maschinell erstellt und ist freibleibend, sofern keine abweichende Gültigkeit angegeben ist. Es stellt kein rechtsverbindliches Vertragsangebot im Sinne einer Bindungsfrist ohne gesonderte Vereinbarung dar.')}
  `
}

// Mahnung/Zahlungserinnerung als Brief - dieselbe Kopf-/Fußzeilen-Gestaltung
// wie Rechnung/Angebot, aber statt einer Positionstabelle der bereits an
// anderer Stelle erzeugte Mahntext (Finanzen.tsx, mahnschreibenText()) als
// Brieftext, plus ein kompakter "Offener Betrag"-Balken.
export function mahnungDruckHtml(params: {
  stufeTitel: string
  brieftext: string
  rechnungsnummer: string
  betragBruttoCents: number
  firma: DruckFirma
  kundeName: string
  kundeRechnungsadresse: string | null
}) {
  const { stufeTitel, brieftext, rechnungsnummer, betragBruttoCents, firma, kundeName, kundeRechnungsadresse } = params
  return `
    <div class="kopf">
      ${firmenkopf(firma)}
      <div>
        <div class="dok-titel">${escapeHtml(stufeTitel)}</div>
        <div class="dok-meta">
          zu Rechnung ${escapeHtml(rechnungsnummer)}<br />
          Datum: ${datumDe(new Date().toISOString())}
        </div>
      </div>
    </div>

    <div class="an">
      <div class="an-label">Empfänger</div>
      <div class="an-name">${escapeHtml(kundeName)}</div>
      ${kundeRechnungsadresse ? `<div>${escapeHtml(kundeRechnungsadresse).replace(/\n/g, '<br />')}</div>` : ''}
    </div>

    <div class="summe-leiste" style="margin-left:0;">
      <span class="label">Offener Betrag</span>
      <span class="betrag">${centsZuEuro(betragBruttoCents)}</span>
    </div>

    <p class="brieftext">${escapeHtml(brieftext)}</p>

    ${fusszeile(firma)}
  `
}
