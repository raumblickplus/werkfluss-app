-- Technik-/Materialdaten-Hub (Konzept Abschnitt 8.16) - bisher komplett
-- unumgesetzt. Hier bewusst nur der Teil, der ohne KI-Bewertung sofort
-- verlässlich ist: eine gemeinsame Artikelliste je Projekt mit
-- Datenblatt-Ablage und Lieferstatus an einem Ort statt verteilt über
-- E-Mail-Anhänge, Hersteller-Websites und WhatsApp-Fotos.
--
-- Bewusst NICHT umgesetzt: der KI-Smart-Home-Kompatibilitätscheck
-- (KNX/Loxone-Trafodimensionierung o.ä.) und die schematische
-- Kabelführungsdarstellung - beides bräuchte eine belastbare technische
-- Bewertungsgrundlage, die hier nicht vorgetäuscht werden soll (siehe
-- Konzept Abschnitt 17, Haftungshinweis). Ebenso nicht umgesetzt:
-- automatische Lieferzeit-Updates direkt vom Hersteller (bräuchte eine
-- Partnerintegration je Hersteller) und die automatische Verknüpfung mit
-- dem Zeitplan bei Lieferverzug (Abschnitt 8.8) - der Lieferstatus wird
-- hier manuell gepflegt.

create table technik_artikel (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  gewerk_id uuid references gewerke(id) on delete set null,
  bezeichnung text not null,
  hersteller text,
  artikelnummer text,
  lieferstatus text not null default 'geplant' check (lieferstatus in ('geplant', 'bestellt', 'unterwegs', 'geliefert', 'verbaut')),
  liefertermin date,
  notiz text,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table technik_artikel enable row level security;

create policy "Mitglieder verwalten Technik-Artikel" on technik_artikel
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

create table technik_dokumente (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references technik_artikel(id) on delete cascade,
  dateiname text not null,
  pfad text not null,
  erstellt_am timestamptz not null default now()
);

alter table technik_dokumente enable row level security;

create policy "Mitglieder sehen Technik-Dokumente" on technik_dokumente
  for select using (
    exists (select 1 from technik_artikel a where a.id = artikel_id and public.is_member_of_projekt(a.projekt_id))
  );
create policy "Mitglieder verwalten Technik-Dokumente" on technik_dokumente
  for all using (
    exists (select 1 from technik_artikel a where a.id = artikel_id and public.is_member_of_projekt(a.projekt_id))
  ) with check (
    exists (select 1 from technik_artikel a where a.id = artikel_id and public.is_member_of_projekt(a.projekt_id))
  );

-- Öffentlicher Bucket, analog zu materialmuster/hersteller-produkte:
-- technische Datenblätter sind Herstellerliteratur, keine sensiblen Daten.
insert into storage.buckets (id, name, public)
values ('technik-dokumente', 'technik-dokumente', true)
on conflict (id) do nothing;

create policy "Technik-Dokumente öffentlich lesbar" on storage.objects
  for select using (bucket_id = 'technik-dokumente');
create policy "Mitglieder laden Technik-Dokumente hoch" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'technik-dokumente'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
create policy "Mitglieder löschen Technik-Dokumente" on storage.objects
  for delete to authenticated using (
    bucket_id = 'technik-dokumente'
    and public.is_member_of_projekt(((storage.foldername(name))[1])::uuid)
  );
