-- Eigener Lagerbestand (Konzept Abschnitt 8.15: "Handwerksbetriebe
-- hinterlegen ihren eigenen Lagerbestand sowie Anbindungen zu bevorzugten
-- Lieferanten") - bisher komplett unumgesetzt. Hier bewusst nur der Teil,
-- der ohne echten Lieferanten-Partner sofort nutzbar ist: die eigene
-- Bestandsliste mit Mindestbestand-Warnung. Eine Lieferanten-/Großhändler-
-- Anbindung (Bestand, Preis, Lieferzeit beim Großhändler) und der
-- automatische Materialabgleich aus dem Mängel-/Aufgaben-Workflow bleiben
-- bewusst offen - dafür bräuchte es eine echte Partnerintegration je
-- Großhändler, kein Tag-1-Feature.

create table lager_artikel (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firmen(id) on delete cascade,
  gewerk_id uuid references gewerke(id) on delete set null,
  bezeichnung text not null,
  einheit text,
  bestand numeric not null default 0,
  mindestbestand numeric,
  notiz text,
  erstellt_am timestamptz not null default now()
);

alter table lager_artikel enable row level security;

-- Gleiches Rechtemodell wie beim Preiskatalog (0017/0022): lesen dürfen
-- alle Firmenmitglieder (sie müssen vor Ort wissen, was verfügbar ist),
-- pflegen nur Inhaber/Geschäftsführung/Einkauf.
create policy "Firmenmitglieder sehen eigenen Lagerbestand" on lager_artikel
  for select using (public.is_member_of_firma(firma_id));
create policy "Einkaufsrolle verwaltet Lagerbestand" on lager_artikel
  for all using (public.hat_einkauf_zugriff(firma_id)) with check (public.hat_einkauf_zugriff(firma_id));
