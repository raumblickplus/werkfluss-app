-- HOAI-Leistungsphasen-Tracking (Konzept Abschnitt 8.10/13) - laut Konzept
-- selbst "strukturelles Rueckgrat der Planungsphase" und explizit als einer
-- von vier Punkten genannt, die die Normen-/Verwaltungstiefe gegenueber
-- PlanRadar/Capmo ausmachen (Abschnitt 5) - bisher komplett unumgesetzt.
--
-- Bewusst das Standard-9-Phasen-Modell nach HOAI Paragraph 34 (Leistungsbild
-- Gebaeude/Innenraeume) mit den ueblichen Honorar-Prozentsaetzen als fester
-- Vorbelegung je Projekt - keine automatische Anpassung je Gebaeudeklasse
-- (z.B. WEG-Sondereigentums-Trennung aus 8.13), das waere eine eigene,
-- groessere Regelwerk-Erweiterung.
--
-- Verwaltung (Status/Termine/Notiz) bleibt beim Projekteigentuemer (wie bei
-- den Genehmigungen) - die Leistungsphasen sind eine Planungs-/Honorar-
-- Struktur des planenden/GU-Betriebs, nicht etwas, in das jedes beteiligte
-- Gewerk selbst eintraegt. Sichtbar ist der Fortschritt aber fuer alle
-- Projektbeteiligten, wie beim Technik-Hub/Bautagebuch.

create table leistungsphasen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  phase_nr smallint not null check (phase_nr between 1 and 9),
  bezeichnung text not null,
  honorar_prozent numeric not null,
  status text not null default 'nicht_begonnen' check (status in ('nicht_begonnen', 'in_bearbeitung', 'abgeschlossen')),
  start_datum date,
  ende_datum date,
  notiz text,
  aktualisiert_am timestamptz not null default now(),
  unique (projekt_id, phase_nr)
);

alter table leistungsphasen enable row level security;

create policy "Mitglieder sehen Leistungsphasen" on leistungsphasen
  for select using (public.is_member_of_projekt(projekt_id));

-- Nur der Eigentuemer legt die Standard-9-Phasen an und pflegt sie.
create policy "Eigentuemer legt Leistungsphasen an" on leistungsphasen
  for insert with check (public.is_owner_of_projekt(projekt_id));
create policy "Eigentuemer pflegt Leistungsphasen" on leistungsphasen
  for update using (public.is_owner_of_projekt(projekt_id));
create policy "Eigentuemer loescht Leistungsphasen" on leistungsphasen
  for delete using (public.is_owner_of_projekt(projekt_id));
