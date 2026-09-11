-- Rechnungspositionen + Bestellreferenz (Julian-Feedback 11.09.2026:
-- "es sollte ein baukasten in diesem design werden" - der gezeigte
-- Referenz-Editor hat eine "+ Element hinzufügen"-Positionstabelle).
--
-- Bisher hatte rechnungen_ausgang nur ein einziges Summenfeld
-- (summe_netto_cents) - im PDF-Export (0051) ausdrücklich als "bewusst
-- nicht umgesetzt" dokumentiert. Angebote haben mit angebot_positionen
-- (0017_preiskatalog.sql) längst eine echte Positionstabelle; diese
-- Migration überträgt genau dasselbe Muster auf Rechnungen.
--
-- summe_netto_cents bleibt bestehen und ist weiterhin die gespeicherte,
-- maßgebliche Summe (wie bei angebote) - wenn Positionen gepflegt werden,
-- berechnet und schreibt das Frontend die Summe daraus, ansonsten bleibt
-- die bisherige freie Zahleneingabe (inkl. Leistungsstand-Vorschlag,
-- 0045) unverändert nutzbar. Keine Migration alter Rechnungen nötig -
-- eine Rechnung ganz ohne Positionszeilen ist weiterhin gültig.
--
-- Bestellreferenz (Kunden-Bestell-/Auftragsnummer) ist das zweite,
-- konkrete Feld aus Julians Referenz-Screenshot ("Bestellreferenz
-- hinzufügen"), rein informativ für den Rechnungskopf.

create table rechnung_positionen (
  id uuid primary key default gen_random_uuid(),
  rechnung_id uuid not null references rechnungen_ausgang(id) on delete cascade,
  kurztext text not null,
  menge numeric not null default 1,
  einheit text,
  einzelpreis_cents integer not null,
  reihenfolge integer not null default 0,
  erstellt_am timestamptz not null default now()
);

alter table rechnungen_ausgang add column if not exists bestellreferenz text;

alter table rechnung_positionen enable row level security;

-- Zugriff spiegelt exakt die bestehenden Policies auf rechnungen_ausgang
-- selbst: Finanzrolle der ausführenden Firma verwaltet (0022), Bauherr
-- sieht nur lesend (0048) - beide über einen Join auf rechnungen_ausgang,
-- da Positionen keine eigene projekt_id/firma_id führen.
create policy "Finanzrolle sieht Rechnungspositionen" on rechnung_positionen
  for select using (
    exists (
      select 1 from rechnungen_ausgang r
      join projekte p on p.id = r.projekt_id
      where r.id = rechnung_positionen.rechnung_id and public.hat_finanz_zugriff(p.firma_id)
    )
  );
create policy "Finanzrolle verwaltet Rechnungspositionen" on rechnung_positionen
  for all using (
    exists (
      select 1 from rechnungen_ausgang r
      join projekte p on p.id = r.projekt_id
      where r.id = rechnung_positionen.rechnung_id and public.hat_finanz_zugriff(p.firma_id)
    )
  ) with check (
    exists (
      select 1 from rechnungen_ausgang r
      join projekte p on p.id = r.projekt_id
      where r.id = rechnung_positionen.rechnung_id and public.hat_finanz_zugriff(p.firma_id)
    )
  );
create policy "Bauherr sieht Rechnungspositionen" on rechnung_positionen
  for select using (
    exists (
      select 1 from rechnungen_ausgang r
      where r.id = rechnung_positionen.rechnung_id and public.ist_bauherr_von_projekt(r.projekt_id)
    )
  );
