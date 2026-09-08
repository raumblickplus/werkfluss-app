-- KI-Fotoerkennung mit DIN-Abgleich pro Gewerk (Konzept Abschnitt 8.1 /
-- Phase 2 der Roadmap, Abschnitt 16).
--
-- WICHTIG (Konzept Abschnitt 17, Haftungshinweis): das ist ausdruecklich
-- eine unverbindliche KI-Ersteinschaetzung, keine Norm-Pruefung und keine
-- Zertifizierung. Die Kennzeichnung dazu erfolgt bei jeder Anzeige eines
-- Ergebnisses im Frontend; die Edge-Function "foto-einschaetzung" ist
-- zusaetzlich angewiesen, keine konkreten DIN-/VOB-Nummern zu erfinden und
-- alle Beobachtungen vorsichtig zu formulieren.
--
-- Der Foto-Upload fuer Bautagebuch-Eintraege existierte bisher nicht in der
-- Oberflaeche, obwohl die Spalte "fotos" schon seit Migration 0001 da war -
-- diese Migration ergaenzt den dafuer noetigen Storage-Bucket sowie die
-- Tabelle fuer die KI-Ergebnisse je Foto.

insert into storage.buckets (id, name, public)
values ('bautagebuch-fotos', 'bautagebuch-fotos', true)
on conflict (id) do nothing;

create policy "Bautagebuch-Fotos oeffentlich lesbar" on storage.objects
  for select using (bucket_id = 'bautagebuch-fotos');
create policy "Angemeldete laden Bautagebuch-Fotos hoch" on storage.objects
  for insert to authenticated with check (bucket_id = 'bautagebuch-fotos');
create policy "Angemeldete loeschen Bautagebuch-Fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'bautagebuch-fotos');

create table foto_ki_einschaetzungen (
  id uuid primary key default gen_random_uuid(),
  bautagebuch_id uuid not null references bautagebuch_eintraege(id) on delete cascade,
  foto_url text not null,
  gewerk text,
  ergebnis jsonb not null default '{}'::jsonb,
  erstellt_am timestamptz not null default now()
);

alter table foto_ki_einschaetzungen enable row level security;

create policy "Projektbeteiligte sehen Foto-Einschaetzungen" on foto_ki_einschaetzungen
  for select using (
    exists (
      select 1 from bautagebuch_eintraege b
      where b.id = foto_ki_einschaetzungen.bautagebuch_id and public.is_member_of_projekt(b.projekt_id)
    )
  );
create policy "Projektbeteiligte verwalten Foto-Einschaetzungen" on foto_ki_einschaetzungen
  for all using (
    exists (
      select 1 from bautagebuch_eintraege b
      where b.id = foto_ki_einschaetzungen.bautagebuch_id and public.is_member_of_projekt(b.projekt_id)
    )
  ) with check (
    exists (
      select 1 from bautagebuch_eintraege b
      where b.id = foto_ki_einschaetzungen.bautagebuch_id and public.is_member_of_projekt(b.projekt_id)
    )
  );
