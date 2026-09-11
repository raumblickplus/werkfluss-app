-- Steuerabgaben-Uebersicht (Konzept Abschnitt 8.7/8.12: "Steuerabgaben-
-- Management als Bauherren-/Betriebsuebersicht: Faelligkeiten, Status",
-- und die im Datenmodell aus Abschnitt 15 bereits vorgesehene Entitaet
-- "Steuervorgang (Art, Faelligkeit, Status)") - bisher komplett
-- unumgesetzt, obwohl Mahnwesen und DATEV-Export aus demselben Abschnitt
-- 8.7 schon laengst gebaut sind.
--
-- Bewusst firma-, nicht projektbezogen (Steuerpflichten treffen den
-- Betrieb, nicht ein einzelnes Bauprojekt) - dieselbe Blickrichtung wie
-- der Preiskatalog/Lagerbestand. Zugriff ueber hat_finanz_zugriff wie bei
-- den Ausgangsrechnungen (0022) - dieselbe Rolle, die schon Rechnungen
-- und den DATEV-Export sieht/pflegt, soll auch Steuertermine pflegen.
--
-- Ausdruecklich KEINE Steuerberatung, KEINE echte Umsatzsteuervoranmeldung
-- und KEINE ELSTER-Anbindung - nur ein Faelligkeitskalender mit Status
-- plus einer unverbindlichen, regelbasierten (nicht KI-basierten)
-- Schaetzung der USt-Zahllast aus den bereits erfassten Ausgangsrechnungen,
-- nach demselben "erster Entwurf, vor produktivem Einsatz mit
-- Steuerberater/-in pruefen"-Prinzip wie der DATEV-Export.

create table steuervorgaenge (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firmen(id) on delete cascade,
  art text not null check (art in ('ust_voranmeldung', 'gewerbesteuer_vorauszahlung', 'einkommensteuer_vorauszahlung', 'sonstige')),
  zeitraum text,
  faellig_am date not null,
  status text not null default 'offen' check (status in ('offen', 'erledigt')),
  geschaetzter_betrag_cents bigint,
  notiz text,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table steuervorgaenge enable row level security;

create policy "Finanzrolle sieht Steuervorgaenge" on steuervorgaenge
  for select using (public.hat_finanz_zugriff(firma_id));
create policy "Finanzrolle verwaltet Steuervorgaenge" on steuervorgaenge
  for all using (public.hat_finanz_zugriff(firma_id)) with check (public.hat_finanz_zugriff(firma_id));
