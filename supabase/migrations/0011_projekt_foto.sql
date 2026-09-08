-- Projektfoto fuer die Kachel-Ansicht der Projektliste: ein optionales
-- Titelbild je Projekt, das in der Uebersicht statt einer reinen Liste
-- als Kachel mit Bild angezeigt wird.

alter table projekte add column if not exists foto_url text;

-- Oeffentlicher Storage-Bucket fuer Projektfotos, analog zum "logos"-Bucket
-- aus 0009: Titelbilder sind unkritisch und sollen auch in einer spaeteren
-- Kundenansicht ohne signierte URLs angezeigt werden koennen.
insert into storage.buckets (id, name, public)
values ('projektfotos', 'projektfotos', true)
on conflict (id) do nothing;

create policy "Projektfotos oeffentlich lesbar" on storage.objects
  for select using (bucket_id = 'projektfotos');
create policy "Angemeldete laden Projektfotos hoch" on storage.objects
  for insert to authenticated with check (bucket_id = 'projektfotos');
create policy "Angemeldete aktualisieren Projektfotos" on storage.objects
  for update to authenticated using (bucket_id = 'projektfotos');
create policy "Angemeldete loeschen Projektfotos" on storage.objects
  for delete to authenticated using (bucket_id = 'projektfotos');
