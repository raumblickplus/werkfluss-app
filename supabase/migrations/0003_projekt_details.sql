-- Ergänzt Kundendaten am Projekt sowie eine leichtgewichtige Liste
-- beteiligter Gewerke/Handwerker/Ansprechpartner, die (noch) kein eigenes
-- Werkfluss-Konto brauchen. Die "echte" Einladung von Firmen mit eigenem
-- Login läuft weiterhin über projekt_mitglieder (Architekturkonzept
-- Abschnitt 4) und ist ein späterer, größerer Baustein (Team-Einladung).

alter table projekte add column if not exists kunde_name text;
alter table projekte add column if not exists kunde_kontakt text;

create table if not exists projekt_beteiligte (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  name text not null,
  rolle text,
  kontakt text,
  erstellt_am timestamptz not null default now()
);

alter table projekt_beteiligte enable row level security;

create policy "Projektbeteiligte sehen Beteiligtenliste" on projekt_beteiligte
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten Beteiligtenliste" on projekt_beteiligte
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));
