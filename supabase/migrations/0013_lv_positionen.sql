-- Leistungsverzeichnis-Positionen je Projekt (Kern-Workflow Schritt 1:
-- Ausschreibung & Matching, vor dem Angebot). Bewusst als flache
-- Positionsliste je Gewerk, ohne die im Konzept beschriebene automatische
-- VOB-/StLB-Bau-Textvorbefuellung oder das Handwerker-Matching - das folgt
-- spaeter als eigener Baustein.

create table lv_positionen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  gewerk_id uuid references gewerke(id),
  position int not null default 1,
  kurztext text not null,
  langtext text,
  menge numeric,
  einheit text,
  einzelpreis_cents integer,
  status text not null default 'offen' check (status in ('offen', 'angefragt', 'entfallen')),
  erstellt_am timestamptz not null default now()
);

alter table lv_positionen enable row level security;

create policy "Projektbeteiligte sehen LV-Positionen" on lv_positionen
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten LV-Positionen" on lv_positionen
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));
