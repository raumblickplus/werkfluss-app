-- Fördermittel-Antragsbegleitung & Nachweisführung (Konzept Abschnitt 8.11):
-- neben der bereits umgesetzten unverbindlichen Ersteinschätzung
-- (foerdermittel_einschaetzungen, 0028) nennt das Konzept ausdrücklich auch
-- eine "Checkliste der benötigten Unterlagen, Fristenüberwachung,
-- Verknüpfung mit Rechnungen/Belegen ... für den Verwendungsnachweis" - das
-- gab es bisher gar nicht (siehe auch der eigene Hinweistext in
-- ModulPlatzhalter.tsx: "Die Antragsbegleitung/Nachweisführung folgt später").
--
-- Bewusst als einfache, manuell gepflegte Checkliste je Projekt modelliert,
-- nicht je gewähltem Programm strukturiert (Förderprogramme/Bedingungen
-- ändern sich laut Konzept selbst häufig, ein festes Pflichtformular je
-- Programm wäre schnell veraltet). "dokument_referenz" ist bewusst nur ein
-- Freitextfeld (z. B. Rechnungsnummer oder Dateiname) statt einer echten FK
-- auf rechnungen_ausgang/dokumente - der Nachweis kann eine Eingangsrechnung,
-- eine Ausgangsrechnung, ein Foto oder ein Dokument aus einem ganz anderen
-- Teil der App sein, eine strenge Verknüpfung würde die Checkliste nur
-- unnötig einschränken.

create table foerdermittel_nachweise (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  bezeichnung text not null,
  status text not null default 'offen' check (status in ('offen', 'eingereicht', 'akzeptiert')),
  frist date,
  dokument_referenz text,
  notiz text,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table foerdermittel_nachweise enable row level security;

create policy "Projektbeteiligte sehen Nachweise" on foerdermittel_nachweise
  for select using (public.is_member_of_projekt(projekt_id));

create policy "Eigentümer verwaltet Nachweise" on foerdermittel_nachweise
  for all using (public.is_owner_of_projekt(projekt_id)) with check (public.is_owner_of_projekt(projekt_id));
