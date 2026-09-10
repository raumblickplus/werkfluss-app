-- Genehmigungsmanagement (Konzept Abschnitt 8.12: "strukturierte
-- Checklisten für Baugenehmigungsverfahren, Statusverfolgung, Dokumenten-
-- ablage für Bauamt-Korrespondenz") - bisher komplett unumgesetzt.
--
-- Bewusst NICHT umgesetzt: eine echte Schnittstelle zu Bauämtern (XBau/OZG)
-- - laut Konzept selbst "ein mittelfristiges Ziel, kein Tag-1-Feature". Hier
-- nur der sofort nutzbare Teil: Verfahren anlegen, Status pflegen,
-- zugehörige Dokumente (Bauantrag, Bescheide, Auflagen, Schriftverkehr)
-- an einem Ort ablegen statt verteilt über E-Mail-Postfächer.
--
-- Dokumente können persönliche Daten des Bauherrn enthalten (Bauantrag,
-- Bescheide) - anders als die bisherigen Foto-Buckets deshalb ein
-- NICHT-öffentlicher Bucket mit RLS-Prüfung auch beim Lesen (signierte
-- URLs statt public URLs), Pfad-Konvention "<projekt_id>/<genehmigung_id>/..."
-- analog zur Grundriss-Ordnerkonvention aus 0025.

create table genehmigungen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  titel text not null,
  behoerde text,
  status text not null default 'vorzubereiten' check (status in ('vorzubereiten', 'eingereicht', 'in_pruefung', 'genehmigt', 'genehmigt_mit_auflagen', 'abgelehnt')),
  auflagen text,
  eingereicht_am date,
  entschieden_am date,
  notiz text,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table genehmigungen enable row level security;

create policy "Mitglieder sehen Genehmigungen" on genehmigungen
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Eigentümer legt Genehmigungen an" on genehmigungen
  for insert with check (public.is_owner_of_projekt(projekt_id));
create policy "Eigentümer aktualisiert Genehmigungen" on genehmigungen
  for update using (public.is_owner_of_projekt(projekt_id));
create policy "Eigentümer löscht Genehmigungen" on genehmigungen
  for delete using (public.is_owner_of_projekt(projekt_id));

create table genehmigungs_dokumente (
  id uuid primary key default gen_random_uuid(),
  genehmigung_id uuid not null references genehmigungen(id) on delete cascade,
  dateiname text not null,
  pfad text not null,
  hochgeladen_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table genehmigungs_dokumente enable row level security;

create policy "Mitglieder sehen Genehmigungsdokumente" on genehmigungs_dokumente
  for select using (
    exists (select 1 from genehmigungen g where g.id = genehmigung_id and public.is_member_of_projekt(g.projekt_id))
  );
create policy "Eigentümer lädt Genehmigungsdokumente hoch" on genehmigungs_dokumente
  for insert with check (
    exists (select 1 from genehmigungen g where g.id = genehmigung_id and public.is_owner_of_projekt(g.projekt_id))
  );
create policy "Eigentümer löscht Genehmigungsdokumente" on genehmigungs_dokumente
  for delete using (
    exists (select 1 from genehmigungen g where g.id = genehmigung_id and public.is_owner_of_projekt(g.projekt_id))
  );

insert into storage.buckets (id, name, public)
values ('genehmigungs-dokumente', 'genehmigungs-dokumente', false)
on conflict (id) do nothing;

create policy "Mitglieder lesen Genehmigungsdokumente" on storage.objects
  for select to authenticated using (
    bucket_id = 'genehmigungs-dokumente'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Eigentümer laden Genehmigungsdokumente hoch" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'genehmigungs-dokumente'
    and public.is_owner_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Eigentümer löscht Genehmigungsdokumente" on storage.objects
  for delete to authenticated using (
    bucket_id = 'genehmigungs-dokumente'
    and public.is_owner_of_projekt(((storage.foldername(name))[1])::uuid)
  );
