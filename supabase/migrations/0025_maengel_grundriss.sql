-- Mängelmanagement auf dem Grundriss (Konzept Abschnitt 8.1, Mockup
-- "MaengelGrundriss"). maengel.grundriss_x/grundriss_y existieren als
-- Spalten schon seit 0001_init.sql, wurden aber nie befüllt - im Frontend
-- war das bislang nur ein Platzhalter. Es fehlte lediglich der Ort für
-- das Grundriss-Bild selbst je Projekt.

alter table projekte add column if not exists grundriss_url text;

-- Oeffentlicher Storage-Bucket, analog zu materialmuster/hersteller-produkte
-- (Grundrisse sind Plandokumente, keine besonders sensiblen Daten, und
-- muessen fuer alle Projektbeteiligten inkl. Bauherr sichtbar sein).
-- Pfad-Konvention "<projekt_id>/grundriss.<ext>" - Upload/Ersetzen bleibt
-- dem Projekteigentümer vorbehalten (GU/Architektur-Firma), analog dazu,
-- wie schon "planungsnotiz" (0021) nur vom Eigentümer gepflegt wird.
insert into storage.buckets (id, name, public)
values ('grundrisse', 'grundrisse', true)
on conflict (id) do nothing;

create policy "Grundrisse oeffentlich lesbar" on storage.objects
  for select using (bucket_id = 'grundrisse');
create policy "Projekteigner laden Grundriss hoch" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'grundrisse'
    and public.is_owner_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Projekteigner aktualisieren Grundriss" on storage.objects
  for update to authenticated using (
    bucket_id = 'grundrisse'
    and public.is_owner_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Projekteigner loeschen Grundriss" on storage.objects
  for delete to authenticated using (
    bucket_id = 'grundrisse'
    and public.is_owner_of_projekt(((storage.foldername(name))[1])::uuid)
  );
