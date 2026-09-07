-- Rechnungsadresse des Kunden getrennt von der Baustellen-Adresse (projekte.adresse) –
-- wichtig für spätere Buchhaltung/DATEV-Export, wo Rechnungsanschrift und
-- Ausführungsort oft nicht identisch sind.
alter table projekte add column if not exists kunde_rechnungsadresse text;
