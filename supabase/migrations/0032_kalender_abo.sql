-- Kalender-Abo als .ics-Feed (Konzept Abschnitt 8.8: "Kalenderanbindung").
-- Fügt jedem Profil einen eigenen, zufälligen Token hinzu, über den die
-- öffentliche Edge Function kalender-feed genau die Aufgaben dieses einen
-- Nutzers ausliefert (siehe supabase/functions/kalender-feed/index.ts für
-- die ausführliche Begründung, warum ein Token statt eines Supabase-JWT).
--
-- Der Token wird clientseitig per crypto.randomUUID() erzeugt und über die
-- bereits bestehende "Nutzer bearbeitet eigenes Profil"-Policy geschrieben -
-- es braucht dafür keine eigene Funktion. unique, damit zwei Profile nie
-- denselben Token bekommen können.

alter table profile add column kalender_token text unique;
