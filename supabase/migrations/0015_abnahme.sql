-- Abnahme (Kern-Workflow Schritt 5, zwischen Projektdurchführung und
-- Rechnung/Zahlung): digitales Abnahmeprotokoll je Projekt mit Ergebnis,
-- Teilnehmenden und optional direkt erfassten Restmängeln mit Frist.
-- Bewusst als einfache digitale Bestätigung (Name + Zeitstempel der
-- anmeldeten Person), keine kryptografische/rechtsverbindliche
-- elektronische Signatur.

create table abnahmen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  datum date not null default current_date,
  ergebnis text not null check (ergebnis in ('mangelfrei', 'mit_maengeln', 'verweigert')),
  teilnehmer text,
  notizen text,
  bestaetigt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table abnahmen enable row level security;

create policy "Projektbeteiligte sehen Abnahmen" on abnahmen
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten Abnahmen" on abnahmen
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

-- Restmängel, die bei einer Abnahme festgestellt werden, lassen sich der
-- jeweiligen Abnahme zuordnen (zusätzlich zur normalen Mängelliste, deren
-- Status schon vorher "abgenommen" kennt).
alter table maengel add column abnahme_id uuid references abnahmen(id) on delete set null;
