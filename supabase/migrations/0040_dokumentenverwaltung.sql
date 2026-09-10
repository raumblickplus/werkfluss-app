-- Plan- und Dokumentenverwaltung mit Versionierung (Konzept Abschnitt 8.1,
-- erste Bullet-Liste: "Plan- und Dokumentenverwaltung mit Versionierung")
-- - bisher komplett unumgesetzt. Bewusst getrennt von den bereits
-- bestehenden, zweckgebundenen Uploads (Projektfoto, Grundriss,
-- Mängel-/Bautagebuch-Fotos, Genehmigungs-/Technik-Dokumente): hier geht es
-- um allgemeine Projektdokumente (Pläne, Verträge, Ausführungsunterlagen),
-- bei denen die eigentliche Anforderung die Versionshistorie ist - eine
-- neue Planversion ersetzt die alte nicht, sondern ergänzt sie nachvoll-
-- ziehbar (wer hat wann welche Version hochgeladen).
--
-- Zwei Tabellen statt einer: "dokumente" ist der benannte, stabile
-- Container (z.B. "Grundriss OG, Stand Ausführung"), "dokument_versionen"
-- die tatsächlichen Dateien darunter mit fortlaufender Versionsnummer -
-- die aktuelle Version ist einfach die mit der höchsten Nummer.
--
-- Nicht-öffentlicher Bucket mit signierten URLs wie bei den Genehmigungs-
-- dokumenten (0035): Verträge/Ausführungsunterlagen können preis- und
-- personenbezogene Daten enthalten.

create table dokumente (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  titel text not null,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table dokumente enable row level security;

-- Offen für alle Projektbeteiligten (wie Bautagebuch/Aufgaben/Technik-Hub):
-- jedes Gewerk soll eigene Pläne/Unterlagen ablegen können, nicht nur der
-- Eigentümer.
create policy "Mitglieder verwalten Dokumente" on dokumente
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

create table dokument_versionen (
  id uuid primary key default gen_random_uuid(),
  dokument_id uuid not null references dokumente(id) on delete cascade,
  versionsnummer integer not null,
  dateiname text not null,
  pfad text not null,
  hochgeladen_von uuid references profile(id),
  erstellt_am timestamptz not null default now(),
  unique (dokument_id, versionsnummer)
);

alter table dokument_versionen enable row level security;

create policy "Mitglieder sehen Dokumentversionen" on dokument_versionen
  for select using (
    exists (select 1 from dokumente d where d.id = dokument_id and public.is_member_of_projekt(d.projekt_id))
  );
create policy "Mitglieder laden Dokumentversionen hoch" on dokument_versionen
  for insert with check (
    exists (select 1 from dokumente d where d.id = dokument_id and public.is_member_of_projekt(d.projekt_id))
  );

insert into storage.buckets (id, name, public)
values ('projekt-dokumente', 'projekt-dokumente', false)
on conflict (id) do nothing;

create policy "Mitglieder lesen Projektdokumente" on storage.objects
  for select to authenticated using (
    bucket_id = 'projekt-dokumente'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Mitglieder laden Projektdokumente hoch" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'projekt-dokumente'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Mitglieder löschen Projektdokumente" on storage.objects
  for delete to authenticated using (
    bucket_id = 'projekt-dokumente'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
