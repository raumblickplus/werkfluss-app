-- Kontakt- und Bankdaten der Firma (Grundlage für Abschnitt 8.2: Angebote/
-- Rechnungen als PDF). firmen führte bisher nur name/rechtsform/adresse/
-- ust_id (0001) plus DATEV-Felder (0027) - für einen properen Rechnungs-/
-- Angebotskopf fehlten Telefon, E-Mail und eine Bankverbindung für die
-- Zahlungsaufforderung. Bewusst einfache Freitextfelder, keine IBAN-
-- Prüfsummenvalidierung o.ä. - das wäre eine eigene, hier nicht
-- gerechtfertigte Komplexität für reine Anzeigefelder auf einem Dokument.

alter table firmen
  add column if not exists telefon text,
  add column if not exists email text,
  add column if not exists iban text;
