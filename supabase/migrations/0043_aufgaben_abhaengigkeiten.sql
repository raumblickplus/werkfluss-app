-- Gewerke-Abhaengigkeiten & Terminverschiebungen im Zeitplan (Konzept
-- Abschnitt 8.8 und Abschnitt 6, Lebenszyklus-Stufe "Stoerungen &
-- Abweichungen": "Terminverschiebungen... werden im selben System
-- behandelt statt in Telefonaten/WhatsApp zu versickern"). Zeitplan.tsx
-- listet bisher nur Faelligkeitstermine flach je Gewerk - die Datei sagt
-- selbst in ihrer Fussnote, dass Abhaengigkeiten zwischen Gewerken bisher
-- fehlen. Ein echter kritischer Pfad/Gantt bleibt bewusst ausgeklammert
-- (das waere ein eigenes, risikoreicheres Rechenmodell) - hier geht es nur
-- um die einfache, in der Praxis wichtigste Frage: "Wenn sich Aufgabe A
-- verschiebt, welche Aufgabe B haengt direkt daran und sollte mitziehen?"
--
-- Zwei Tabellen:
-- 1) aufgaben_abhaengigkeiten: eine einfache "Ende vor Start"-Beziehung
--    zwischen zwei Aufgaben desselben Projekts (Nachfolger kann erst
--    beginnen, wenn Vorgaenger erledigt/fertig ist). Nur der Eigentuemer
--    legt Abhaengigkeiten an/entfernt sie - das ist Bauablaufplanung,
--    typischerweise Aufgabe der Bauleitung, nicht jedes einzelnen Gewerks.
-- 2) terminverschiebungen: append-only Protokoll jeder Terminaenderung
--    einer bereits terminierten Aufgabe (alter/neuer Termin, Grund,
--    wer) - derselbe Nachvollziehbarkeits-Gedanke wie bei fall_ereignisse
--    (0034). Hier duerfen alle Projektbeteiligten eintragen, weil das
--    Verschieben einer Aufgabe selbst schon nach der bestehenden
--    "Aufgaben verwalten"-Policy je Gewerk moeglich ist (0019) - das
--    Protokoll folgt dieser bestehenden Berechtigung nicht 1:1 nach
--    (das waere dieselbe gewerk-verschachtelte Prüfung nochmal), sondern
--    ist bewusst offen fuer alle Projektbeteiligten als reines
--    Nachvollziehbarkeits-Log, wie bereits bei anderen Projekt-Logs
--    (Bautagebuch, Technik-Hub) gehandhabt.

create table aufgaben_abhaengigkeiten (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  vorgaenger_id uuid not null references aufgaben(id) on delete cascade,
  nachfolger_id uuid not null references aufgaben(id) on delete cascade,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now(),
  check (vorgaenger_id <> nachfolger_id),
  unique (vorgaenger_id, nachfolger_id)
);

alter table aufgaben_abhaengigkeiten enable row level security;

create policy "Mitglieder sehen Abhaengigkeiten" on aufgaben_abhaengigkeiten
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Eigentuemer verwaltet Abhaengigkeiten" on aufgaben_abhaengigkeiten
  for all using (public.is_owner_of_projekt(projekt_id)) with check (public.is_owner_of_projekt(projekt_id));

create table terminverschiebungen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  aufgabe_id uuid not null references aufgaben(id) on delete cascade,
  grund text not null default 'sonstiges' check (grund in ('krankheit', 'lieferverzug', 'wetter', 'folgeverschiebung', 'sonstiges')),
  alter_termin date,
  neuer_termin date,
  kommentar text,
  gemeldet_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table terminverschiebungen enable row level security;

create policy "Mitglieder sehen Terminverschiebungen" on terminverschiebungen
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Mitglieder protokollieren Terminverschiebungen" on terminverschiebungen
  for insert with check (public.is_member_of_projekt(projekt_id));
