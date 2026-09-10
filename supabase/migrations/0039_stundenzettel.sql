-- Stundenzettel (Konzept Abschnitt 9: "Handwerker und Planer werden
-- verpflichtet, bestimmte Artefakte zu führen und freizugeben -
-- Bautagebuch, Stundenzettel, To-do-Listen, Abnahmeprotokolle") - von
-- diesen vier Pflicht-Artefakten war der Stundenzettel bisher als einziger
-- komplett unumgesetzt.
--
-- Jede Firma erfasst ihre eigenen Arbeitsstunden je Projekt (nicht nur die
-- GU-Firma - ein Subunternehmer führt genauso Stundenzettel für seine
-- eigene Abrechnung/seinen eigenen Nachweis). firma_id kommt daher immer
-- aus der aktiven Firma der eintragenden Person, nicht aus einer Auswahl.
--
-- Bewusst NICHT umgesetzt: die im Konzept beschriebene automatische
-- Zahlungsfreigabe aus Stundenzettel+Foto+Unterschrift (GU-Workflow-
-- Mockup) - das ist eine Verknüpfung zu Freigabekompetenzen/Aufträgen, die
-- erst sinnvoll ist, wenn sich die reine Erfassung im Alltag bewährt hat.

create table stundenzettel (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  firma_id uuid not null references firmen(id) on delete cascade,
  nutzer_id uuid references profile(id),
  datum date not null default current_date,
  stunden numeric not null check (stunden > 0),
  taetigkeit text,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table stundenzettel enable row level security;

-- Sichtbar für den Projekteigentümer (braucht den Überblick über alle
-- beteiligten Firmen, z.B. als Abrechnungsgrundlage) und für die eigene
-- Firma (sieht nur ihre eigenen Einträge).
create policy "Eigentümer und eigene Firma sehen Stundenzettel" on stundenzettel
  for select using (public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(firma_id));

create policy "Firmenmitglieder erfassen eigene Stunden" on stundenzettel
  for insert with check (public.is_member_of_firma(firma_id) and public.is_member_of_projekt(projekt_id));
create policy "Firmenmitglieder bearbeiten eigene Stunden" on stundenzettel
  for update using (public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder löschen eigene Stunden" on stundenzettel
  for delete using (public.is_member_of_firma(firma_id));
