-- Foto + KI-Ersteinschätzung am Mangel (Konzept Abschnitt 8.1/10 - die
-- web-taugliche, nicht-AR-gebundene Variante der "AR-Mängeleinschätzung";
-- die echte kamerabasierte AR-Verortung ist laut Entscheidung vom 09.09.2026
-- der künftigen nativen Mobile-App vorbehalten, siehe Abschnitt 18
-- "Weiterhin offen"). maengel.fotos jsonb existiert bereits seit
-- 0001_init.sql, wurde im Frontend aber nie befüllt. Analog zum
-- bestehenden Muster für das Bautagebuch (0018_foto_einschaetzung.sql),
-- aber als eigene Tabelle, weil der Kontext (Mangel statt Bautagebuch-
-- Eintrag) und das Ergebnisformat der KI-Einschätzung unterschiedlich sind.
--
-- WICHTIG (Konzept Abschnitt 17, Haftungshinweis): auch hier eine
-- ausdrücklich unverbindliche Ersteinschätzung, keine fachliche/statische
-- Bewertung - siehe Kennzeichnung im Frontend und im Edge-Function-Prompt.

insert into storage.buckets (id, name, public)
values ('maengel-fotos', 'maengel-fotos', true)
on conflict (id) do nothing;

create policy "Mangel-Fotos oeffentlich lesbar" on storage.objects
  for select using (bucket_id = 'maengel-fotos');
create policy "Angemeldete laden Mangel-Fotos hoch" on storage.objects
  for insert to authenticated with check (bucket_id = 'maengel-fotos');
create policy "Angemeldete loeschen Mangel-Fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'maengel-fotos');

create table mangel_ki_einschaetzungen (
  id uuid primary key default gen_random_uuid(),
  mangel_id uuid not null references maengel(id) on delete cascade,
  foto_url text not null,
  ergebnis jsonb not null default '{}'::jsonb,
  erstellt_am timestamptz not null default now()
);

alter table mangel_ki_einschaetzungen enable row level security;

create policy "Projektbeteiligte sehen Mangel-Einschaetzungen" on mangel_ki_einschaetzungen
  for select using (
    exists (
      select 1 from maengel m
      where m.id = mangel_ki_einschaetzungen.mangel_id and public.is_member_of_projekt(m.projekt_id)
    )
  );
create policy "Projektbeteiligte verwalten Mangel-Einschaetzungen" on mangel_ki_einschaetzungen
  for all using (
    exists (
      select 1 from maengel m
      where m.id = mangel_ki_einschaetzungen.mangel_id and public.is_member_of_projekt(m.projekt_id)
    )
  ) with check (
    exists (
      select 1 from maengel m
      where m.id = mangel_ki_einschaetzungen.mangel_id and public.is_member_of_projekt(m.projekt_id)
    )
  );
