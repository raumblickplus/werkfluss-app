-- Digitale Unterschrift beim Abnahmeprotokoll (Ergänzung zu 0015_abnahme.sql
-- - Kern-Workflow Schritt 5). Bisher wurde eine Abnahme nur mit Name +
-- Zeitstempel der angemeldeten Person "bestätigt" (bestaetigt_von_name),
-- ganz ohne visuelle Unterschrift, wie sie bei einer Bauabnahme in der
-- Praxis erwartet wird - Abnahme.tsx wies in der eigenen Kopfzeile selbst
-- schon darauf hin. Ergänzt jetzt eine per Finger/Maus/Stift auf einem
-- Canvas gezeichnete Unterschrift, als PNG in einem eigenen, nicht-
-- öffentlichen Storage-Bucket abgelegt (Pfad-Konvention wie bei den
-- Genehmigungsdokumenten aus 0035: "<projekt_id>/<abnahme_id>.png").
--
-- Ausdrücklich weiterhin KEINE kryptografisch-rechtsverbindliche
-- elektronische Signatur nach eIDAS (qualifizierte elektronische
-- Signatur/QES) - dafür bräuchte es einen zertifizierten externen
-- Signaturdienst. Das ist eine praxisübliche, visuelle Unterschrift wie
-- bei einer Paketzustellung, keine rechtlich geprüfte Ersatzform der
-- Schriftform.

alter table abnahmen add column if not exists unterschrift_pfad text;

insert into storage.buckets (id, name, public)
values ('abnahme-unterschriften', 'abnahme-unterschriften', false)
on conflict (id) do nothing;

-- Dieselbe Beteiligten-Berechtigung wie bei "Projektbeteiligte verwalten
-- Abnahmen" in 0015 (nicht nur der Eigentümer) - jede beteiligte Firma
-- kann eine Abnahme mit erfassen, also auch die Unterschrift dazu.
create policy "Projektbeteiligte lesen Abnahme-Unterschriften" on storage.objects
  for select to authenticated using (
    bucket_id = 'abnahme-unterschriften'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Projektbeteiligte laden Abnahme-Unterschriften hoch" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'abnahme-unterschriften'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Projektbeteiligte loeschen Abnahme-Unterschriften" on storage.objects
  for delete to authenticated using (
    bucket_id = 'abnahme-unterschriften'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
