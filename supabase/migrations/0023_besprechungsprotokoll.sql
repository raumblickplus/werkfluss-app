-- Automatische Protokollierung von Video-/Sprachbesprechungen (Konzept
-- Abschnitt 16 Phase 3: "Video/Sprachnachrichten mit automatischer
-- Protokollierung"; Mockup "GU-Workflow" zeigt "Video-Baubesprechung mit
-- KI-Protokoll"). Ablauf: beide Gesprächsteilnehmer zeichnen während eines
-- laufenden Videoanrufs (siehe Kommunikation.tsx) NUR ihre eigene Tonspur
-- separat auf - das Mischen der Streams würde eine komplexere Web-Audio-
-- Pipeline brauchen und ist für den Zweck (Transkript, kein Mitschnitt-
-- Archiv) nicht nötig. Nach dem Anruf transkribiert eine Edge Function
-- (besprechung-protokoll) beide Aufnahmen separat per Whisper und fügt sie
-- zeitlich zu einem Gesprächsverlauf zusammen, den Claude zu einem
-- strukturierten Protokoll verdichtet.
--
-- WICHTIG (Julians ausdrückliche Entscheidung für diesen - aufwendigeren,
-- aber robusteren - Weg statt Live-Spracherkennung im Browser): eine
-- Aufzeichnung startet ausschließlich nach expliziter Zustimmung BEIDER
-- Seiten (Signal-Handshake in Kommunikation.tsx) - unangekündigtes
-- Mitschneiden eines nichtöffentlich gesprochenen Worts ist in Deutschland
-- nach § 201 StGB strafbar. Die Rohaufnahmen werden nach erfolgreicher
-- Transkription von der Edge Function wieder gelöscht (Datensparsamkeit) -
-- nur das Transkript-Protokoll bleibt erhalten.

create table besprechungen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  gestartet_von uuid references profile(id),
  teilnehmer uuid[] not null,
  status text not null default 'angefragt'
    check (status in ('angefragt', 'laeuft', 'wird_transkribiert', 'transkribiert', 'fehler')),
  protokoll jsonb,
  erstellt_am timestamptz not null default now(),
  beendet_am timestamptz
);

alter table besprechungen enable row level security;

create policy "Projektbeteiligte sehen Besprechungen" on besprechungen
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten Besprechungen" on besprechungen
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

create table besprechungsaufnahmen (
  id uuid primary key default gen_random_uuid(),
  besprechung_id uuid not null references besprechungen(id) on delete cascade,
  sprecher_id uuid references profile(id),
  datei_pfad text not null,
  hochgeladen_am timestamptz not null default now()
);

alter table besprechungsaufnahmen enable row level security;

create policy "Projektbeteiligte sehen Aufnahme-Metadaten" on besprechungsaufnahmen
  for select using (
    exists (
      select 1 from besprechungen b
      where b.id = besprechungsaufnahmen.besprechung_id and public.is_member_of_projekt(b.projekt_id)
    )
  );
create policy "Projektbeteiligte verwalten Aufnahme-Metadaten" on besprechungsaufnahmen
  for all using (
    exists (
      select 1 from besprechungen b
      where b.id = besprechungsaufnahmen.besprechung_id and public.is_member_of_projekt(b.projekt_id)
    )
  ) with check (
    exists (
      select 1 from besprechungen b
      where b.id = besprechungsaufnahmen.besprechung_id and public.is_member_of_projekt(b.projekt_id)
    )
  );

-- Bewusst NICHT öffentlicher Bucket (anders als bautagebuch-fotos/
-- materialmuster): Gesprächsaufnahmen sind sensible personenbezogene Daten.
-- Pfad-Konvention "<besprechung_id>/<sprecher_id>.webm" - die Policies lesen
-- die besprechung_id aus dem ersten Pfadsegment (storage.foldername) und
-- prüfen darüber die Projekt-Mitgliedschaft.
insert into storage.buckets (id, name, public)
values ('besprechungsaufnahmen', 'besprechungsaufnahmen', false)
on conflict (id) do nothing;

create policy "Projektbeteiligte laden Besprechungsaufnahmen hoch" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'besprechungsaufnahmen'
    and exists (
      select 1 from besprechungen b
      where b.id::text = (storage.foldername(name))[1] and public.is_member_of_projekt(b.projekt_id)
    )
  );
create policy "Projektbeteiligte lesen Besprechungsaufnahmen" on storage.objects
  for select to authenticated using (
    bucket_id = 'besprechungsaufnahmen'
    and exists (
      select 1 from besprechungen b
      where b.id::text = (storage.foldername(name))[1] and public.is_member_of_projekt(b.projekt_id)
    )
  );
create policy "Projektbeteiligte loeschen Besprechungsaufnahmen" on storage.objects
  for delete to authenticated using (
    bucket_id = 'besprechungsaufnahmen'
    and exists (
      select 1 from besprechungen b
      where b.id::text = (storage.foldername(name))[1] and public.is_member_of_projekt(b.projekt_id)
    )
  );
