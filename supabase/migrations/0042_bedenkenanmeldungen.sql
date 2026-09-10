-- Bedenkenanmeldung nach VOB/B Paragraph 4 Abs. 3 (Konzept Abschnitt 8.10,
-- "DIN-Formulare je Gewerk: hinterlegte, ausfuellbare Formblaetter/
-- Pruefprotokolle (z.B. Abnahmeprotokolle, Bedenkenanmeldungen)") -
-- Abnahmeprotokolle gibt es bereits als eigener Tab (Abnahme.tsx), die
-- Bedenkenanmeldung war bisher komplett unumgesetzt.
--
-- Eine Bedenkenanmeldung ist die schriftliche Mitteilung eines ausfuehrenden
-- Betriebs an den Auftraggeber, dass Bedenken gegen die vorgesehene Art der
-- Ausfuehrung, gegen die Qualitaet gelieferter Stoffe/Bauteile oder gegen
-- die Leistungen anderer Unternehmer bestehen - typischerweise VOR Beginn
-- der betroffenen Arbeiten. Sie ist ein zentrales Instrument zur eigenen
-- rechtlichen Absicherung (Enthaftung) und bewusst als eigenstaendiges,
-- formales Dokument modelliert statt als gewoehnlicher Chat-Verlauf -
-- deshalb kein Event-Log wie bei Faellen (0034), sondern eine einzelne,
-- nach dem Einreichen inhaltlich unveraenderliche Meldung mit genau einer
-- Antwort/Statusaenderung durch den Eigentuemer.
--
-- Ausdruecklich KEINE Rechtsberatung, keine automatische Fristenberechnung
-- und keine automatische Bauablaufsperre - reine strukturierte
-- Dokumentation, die Nutzer bisher per E-Mail/Fax selbst erledigen mussten.

create table bedenkenanmeldungen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  firma_id uuid not null references firmen(id),
  betrifft text,
  betreff text not null,
  beschreibung text not null,
  status text not null default 'eingereicht' check (status in ('eingereicht', 'beantwortet', 'ausgeraeumt')),
  antwort text,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now(),
  beantwortet_am timestamptz
);

alter table bedenkenanmeldungen enable row level security;

-- Sichtbar fuer den Projekteigentuemer (muss reagieren koennen) und die
-- meldende Firma (braucht den eigenen Nachweis) - wie bei Faellen (0034).
create policy "Eigentuemer und meldende Firma sehen Bedenkenanmeldungen" on bedenkenanmeldungen
  for select using (public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(firma_id));

create policy "Firmenmitglieder melden Bedenken an" on bedenkenanmeldungen
  for insert with check (public.is_member_of_firma(firma_id) and public.is_member_of_projekt(projekt_id));

-- Nur der Eigentuemer beantwortet (Status/Antwort) - die Meldung selbst
-- bleibt nach dem Einreichen inhaltlich unveraendert (formales Dokument).
create policy "Eigentuemer beantwortet Bedenkenanmeldungen" on bedenkenanmeldungen
  for update using (public.is_owner_of_projekt(projekt_id));
