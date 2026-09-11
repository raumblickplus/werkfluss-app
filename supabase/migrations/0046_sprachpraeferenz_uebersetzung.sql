-- Durchgängige Text-Übersetzung in Bautagebuch & Tagesbericht (Konzept
-- Abschnitt 8.3): unterscheidet ausdrücklich zwei Ebenen mit
-- unterschiedlicher technischer Reife - "Text-Chat, Bautagebuch-Einträge,
-- Tagesbericht: durchgängige automatische Übersetzung in die vom
-- jeweiligen Nutzer hinterlegte Sprache" (technisch unkritischster Fall,
-- sollte laut Konzept frueh kommen) versus die bereits gebauten Live-
-- Untertitel in Videoanrufen (Kommunikation.tsx, per Web Speech API).
-- Die Chat-Uebersetzung in Kommunikation.tsx gibt es zwar schon, aber nur
-- als manueller Klick pro Nachricht, nicht automatisch anhand einer
-- hinterlegten Spracheinstellung - Bautagebuch und Tagesbericht hatten
-- bisher ueberhaupt keine Uebersetzung.
--
-- profile.bevorzugte_sprache: DeepL-Zielsprachcode, Default 'DE' (dann
-- greift keine Uebersetzung - die meisten Nutzer brauchen sie nicht).
-- Dieselbe Sprachliste wie im Kommunikation-Tab (DE/EN/TR/PL/RO/RU/UK/
-- IT/FR/ES), gezielt fuer die im Konzept genannte Zielgruppe (Handwerker/
-- Subunternehmer aus PL/UA/Kosovo/Baltikum).
--
-- bautagebuch_uebersetzungen: Cache je Eintrag+Sprache (nicht je
-- Betrachter!), damit derselbe Eintrag nicht fuer jede Person mit
-- gleicher Sprachpraeferenz erneut kostenpflichtig uebersetzt wird -
-- gleiche Idee wie ein Uebersetzungsspeicher, kein Live-Neuuebersetzen.

alter table profile add column bevorzugte_sprache text not null default 'DE'
  check (bevorzugte_sprache in ('DE', 'EN', 'TR', 'PL', 'RO', 'RU', 'UK', 'IT', 'FR', 'ES'));

create table bautagebuch_uebersetzungen (
  id uuid primary key default gen_random_uuid(),
  eintrag_id uuid not null references bautagebuch_eintraege(id) on delete cascade,
  sprache text not null,
  taetigkeiten text,
  besonderheiten text,
  erstellt_am timestamptz not null default now(),
  unique (eintrag_id, sprache)
);

alter table bautagebuch_uebersetzungen enable row level security;

create policy "Projektbeteiligte sehen Uebersetzungen" on bautagebuch_uebersetzungen
  for select using (
    exists (
      select 1 from bautagebuch_eintraege b
      where b.id = bautagebuch_uebersetzungen.eintrag_id and public.is_member_of_projekt(b.projekt_id)
    )
  );
create policy "Projektbeteiligte legen Uebersetzungen ab" on bautagebuch_uebersetzungen
  for insert with check (
    exists (
      select 1 from bautagebuch_eintraege b
      where b.id = bautagebuch_uebersetzungen.eintrag_id and public.is_member_of_projekt(b.projekt_id)
    )
  );
create policy "Projektbeteiligte aktualisieren Uebersetzungen" on bautagebuch_uebersetzungen
  for update using (
    exists (
      select 1 from bautagebuch_eintraege b
      where b.id = bautagebuch_uebersetzungen.eintrag_id and public.is_member_of_projekt(b.projekt_id)
    )
  );
