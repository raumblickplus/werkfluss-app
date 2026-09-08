-- Phase 2 "Effizienz": Preiskatalog + automatische Angebotserstellung.
-- Jede Firma pflegt einmalig eine wiederverwendbare Preisliste je Gewerk
-- (statt bei jeder Ausschreibung erneut Preise von Hand zu tippen). Beim
-- Erstellen eines Angebots aus dem Leistungsverzeichnis eines Projekts
-- werden offene LV-Positionen automatisch gegen den eigenen Preiskatalog
-- abgeglichen (Abgleich über den Kurztext) und als Angebotspositionen
-- uebernommen - Grundlage fuer die im Konzept (Abschnitt 16, Phase 2)
-- vorgesehene automatische Angebotserstellung.

create table preiskatalog_positionen (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firmen(id) on delete cascade,
  gewerk_id uuid references gewerke(id) on delete set null,
  kurztext text not null,
  einheit text,
  einzelpreis_cents integer not null,
  erstellt_am timestamptz not null default now()
);

alter table preiskatalog_positionen enable row level security;

create policy "Firmenmitglieder sehen eigenen Preiskatalog" on preiskatalog_positionen
  for select using (public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder verwalten eigenen Preiskatalog" on preiskatalog_positionen
  for all using (public.is_member_of_firma(firma_id)) with check (public.is_member_of_firma(firma_id));

-- Einzelpositionen eines Angebots (bisher hatte "angebote" nur eine
-- Gesamtsumme). Optional an eine lv_positionen-Zeile der Ausschreibung
-- gekoppelt, damit sich ein automatisch erstelltes Angebot bis zur
-- einzelnen Ausschreibungsposition zurueckverfolgen laesst.
create table angebot_positionen (
  id uuid primary key default gen_random_uuid(),
  angebot_id uuid not null references angebote(id) on delete cascade,
  lv_position_id uuid references lv_positionen(id) on delete set null,
  kurztext text not null,
  menge numeric not null default 1,
  einheit text,
  einzelpreis_cents integer not null,
  erstellt_am timestamptz not null default now()
);

alter table angebot_positionen enable row level security;

create policy "Projektbeteiligte sehen Angebotspositionen" on angebot_positionen
  for select using (
    exists (select 1 from angebote a where a.id = angebot_positionen.angebot_id and public.is_member_of_projekt(a.projekt_id))
  );
create policy "Projektbeteiligte verwalten Angebotspositionen" on angebot_positionen
  for all using (
    exists (select 1 from angebote a where a.id = angebot_positionen.angebot_id and public.is_member_of_projekt(a.projekt_id))
  ) with check (
    exists (select 1 from angebote a where a.id = angebot_positionen.angebot_id and public.is_member_of_projekt(a.projekt_id))
  );
