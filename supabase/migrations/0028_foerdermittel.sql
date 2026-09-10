-- Fördermittel-Ersteinschätzung (Konzept Abschnitt 8.11/10/17): unverbindlicher,
-- regelbasierter Abgleich der geplanten Maßnahmen eines Projekts mit den
-- gängigen KfW-/BAFA-Förderkategorien. Bewusst KEINE Förderzusage und keine
-- exakte Fördersummen-Berechnung (siehe Haftungshinweis im Konzept) - das
-- Ergebnis wird trotzdem gespeichert, damit die Einschätzung nachvollziehbar
-- bleibt und nicht bei jedem Seitenaufruf neu wäre.

create table foerdermittel_einschaetzungen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  massnahmen jsonb not null default '[]'::jsonb,
  ergebnis jsonb not null default '[]'::jsonb,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table foerdermittel_einschaetzungen enable row level security;

create policy "Projektbeteiligte sehen Fördermittel-Einschätzungen" on foerdermittel_einschaetzungen
  for select using (public.is_member_of_projekt(projekt_id));

create policy "Eigentümer verwaltet Fördermittel-Einschätzungen" on foerdermittel_einschaetzungen
  for all using (public.is_owner_of_projekt(projekt_id)) with check (public.is_owner_of_projekt(projekt_id));
