-- Firmenweites Netzwerk aus Mitarbeitenden und Partnerfirmen je Gewerk,
-- unabhaengig von einem einzelnen Projekt (Ergaenzung zu projekt_beteiligte,
-- das projektbezogen bleibt). Dient als Kachel-Verzeichnis mit Logo, damit
-- bei der Vergabe schnell sichtbar ist, wer fuer welches Gewerk zur
-- Verfuegung steht.

create table netzwerk_kontakte (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firmen(id) on delete cascade,
  name text not null,
  typ text not null default 'firma' check (typ in ('mitarbeiter', 'firma')),
  gewerk_id uuid references gewerke(id),
  telefon text,
  email text,
  website text,
  logo_url text,
  erstellt_am timestamptz not null default now()
);

alter table netzwerk_kontakte enable row level security;

create policy "Firmenmitglieder sehen Netzwerk" on netzwerk_kontakte
  for select using (public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder verwalten Netzwerk" on netzwerk_kontakte
  for all using (public.is_member_of_firma(firma_id)) with check (public.is_member_of_firma(firma_id));

-- Oeffentlicher Storage-Bucket fuer Logos: Firmen-/Mitarbeiterlogos sind
-- keine sensiblen Daten und sollen spaeter auch in einer Kundenansicht
-- erscheinen koennen, deshalb oeffentlich lesbar statt signierter URLs.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "Logos oeffentlich lesbar" on storage.objects
  for select using (bucket_id = 'logos');
create policy "Angemeldete laden Logos hoch" on storage.objects
  for insert to authenticated with check (bucket_id = 'logos');
create policy "Angemeldete aktualisieren Logos" on storage.objects
  for update to authenticated using (bucket_id = 'logos');
create policy "Angemeldete loeschen Logos" on storage.objects
  for delete to authenticated using (bucket_id = 'logos');
