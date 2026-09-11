-- Spesen & Unterbringung je Projekt/Einsatz (Julian-Backlog, 10.09.2026:
-- "Ein eigener Reiter 'Spesen & Unterbringung' je Projekt/Einsatz: Hotel,
-- Zimmernummer, Reservierungsnummer u. Ä. manuell erfassbar - bewusst ohne
-- Hotel-Buchungsintegration ... sondern als strukturiertes Freitext-/
-- Formularfeld"). Von den drei Teilen dieses Backlog-Eintrags (Subunter-
-- nehmer-Übersicht, Spesen & Unterbringung, eigener Monteur-Zugang) ist
-- dies der kleinste, additive Teil ohne Berührung bestehender Auftrags-/
-- Rollen-Modelle - deshalb zuerst umgesetzt.
--
-- Datenmodell und RLS bewusst 1:1 nach dem Muster von stundenzettel
-- (0039_stundenzettel.sql) - dieselbe Grund-Situation: jede am Projekt
-- beteiligte Firma erfasst ihre eigenen Reise-/Unterbringungsdaten für ihre
-- eigenen Mitarbeiter, nicht nur die GU-Firma. Kein Bezug zu einem
-- konkreten Mitarbeiter-Login nötig (der ist laut Backlog-Notiz ein eigener,
-- noch nicht angegangener dritter Teil) - "wer" steht bei Bedarf als
-- Freitext in notiz.

create table spesen_unterbringung (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  firma_id uuid not null references firmen(id) on delete cascade,
  bezeichnung text not null,
  zimmer_nr text,
  reservierungsnummer text,
  von_datum date,
  bis_datum date,
  notiz text,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table spesen_unterbringung enable row level security;

create policy "Eigentümer und eigene Firma sehen Spesen" on spesen_unterbringung
  for select using (public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(firma_id));

create policy "Firmenmitglieder erfassen eigene Spesen" on spesen_unterbringung
  for insert with check (public.is_member_of_firma(firma_id) and public.is_member_of_projekt(projekt_id));
create policy "Firmenmitglieder bearbeiten eigene Spesen" on spesen_unterbringung
  for update using (public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder löschen eigene Spesen" on spesen_unterbringung
  for delete using (public.is_member_of_firma(firma_id));
