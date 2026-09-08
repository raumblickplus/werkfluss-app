-- Materialmuster je Projekt fuer die neue Projektmappe-Buehne: Fliesen,
-- Boeden, Farben, Oberflaechen etc., die im Projekt zur Auswahl stehen.
-- Vorstufe zur im Konzept beschriebenen Materialbank-Integration
-- (Abschnitt 8.6) - hier zunaechst als projektinterne Galerie.

create table projektmappe_muster (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  name text not null,
  kategorie text,
  bild_url text,
  notiz text,
  erstellt_am timestamptz not null default now()
);

alter table projektmappe_muster enable row level security;

create policy "Projektbeteiligte sehen Materialmuster" on projektmappe_muster
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten Materialmuster" on projektmappe_muster
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

-- Oeffentlicher Storage-Bucket fuer Musterfotos, analog zu logos/projektfotos.
insert into storage.buckets (id, name, public)
values ('materialmuster', 'materialmuster', true)
on conflict (id) do nothing;

create policy "Materialmuster oeffentlich lesbar" on storage.objects
  for select using (bucket_id = 'materialmuster');
create policy "Angemeldete laden Materialmuster hoch" on storage.objects
  for insert to authenticated with check (bucket_id = 'materialmuster');
create policy "Angemeldete aktualisieren Materialmuster" on storage.objects
  for update to authenticated using (bucket_id = 'materialmuster');
create policy "Angemeldete loeschen Materialmuster" on storage.objects
  for delete to authenticated using (bucket_id = 'materialmuster');
