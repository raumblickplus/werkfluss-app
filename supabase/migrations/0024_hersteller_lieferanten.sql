-- Hersteller/Lieferanten-Rolle (Konzept Abschnitt 8.6/8.15, Phase 3 der
-- Roadmap). Julians ausdrückliche Entscheidung: voller Marktplatz mit
-- Provisionsmodell (analog Materialbank.eu), als eigener, selbst
-- registrierbarer Account-Typ (wie der Bauherr aus 0021, aber projekt-
-- UNabhängig - ein Hersteller ist nicht Mitglied eines einzelnen Projekts,
-- sondern stellt seinen Produktkatalog projektübergreifend allen
-- Werkfluss-Nutzern zur Verfügung, ähnlich wie im Vorbild Materialbank).
--
-- WICHTIG zur Provision: "provisionssatz_prozent" unten ist bewusst nur ein
-- Datenfeld für den späteren Abrechnungslauf, OHNE echte Auszahlungs-/
-- Rechnungs-/Zahlungsabwicklungslogik - die gehört laut Konzept (Abschnitt
-- 16/17) zur Finanzinfrastruktur aus Phase 4 (Banking/DATEV, ggf. eigene
-- Zahlungsdiensteerlaubnis oder BaaS-Partnerschaft) und wird hier nicht
-- vorweggenommen. Musterbestellungen selbst sind - wie beim Vorbild
-- Materialbank - für die bestellende Person kostenfrei; Werkfluss würde
-- die Provision künftig direkt mit dem Hersteller abrechnen, nicht pro
-- Musterbestellung dem Bauherrn/Handwerker in Rechnung stellen.

-- ============================================================
-- 1. Hersteller (Mandant, analog "firmen", aber ohne Projektbindung)
-- ============================================================

create table hersteller (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  beschreibung text,
  logo_url text,
  kontakt_email text,
  kontakt_telefon text,
  website text,
  provisionssatz_prozent numeric not null default 10,
  erstellt_am timestamptz not null default now()
);

create table hersteller_mitglieder (
  id uuid primary key default gen_random_uuid(),
  hersteller_id uuid not null references hersteller(id) on delete cascade,
  nutzer_id uuid not null references profile(id) on delete cascade,
  rolle text not null default 'inhaber' check (rolle in ('inhaber', 'mitarbeiter')),
  erstellt_am timestamptz not null default now(),
  unique (hersteller_id, nutzer_id)
);

create function public.is_member_of_hersteller(check_hersteller_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from hersteller_mitglieder
    where hersteller_id = check_hersteller_id and nutzer_id = auth.uid()
  );
$$;

create function public.is_admin_of_hersteller(check_hersteller_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from hersteller_mitglieder
    where hersteller_id = check_hersteller_id
      and nutzer_id = auth.uid()
      and rolle = 'inhaber'
  );
$$;

-- Hersteller anlegen + anlegenden Nutzer als Inhaber eintragen, atomar -
-- selbst registrierbar, kein Einladungs-/Freischaltprozess nötig (Julians
-- Entscheidung), analog create_firma_mit_inhaber aus 0001_init.sql.
create function public.create_hersteller_mit_inhaber(hersteller_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_hersteller_id uuid;
begin
  insert into hersteller (name) values (hersteller_name) returning id into new_hersteller_id;
  insert into hersteller_mitglieder (hersteller_id, nutzer_id, rolle) values (new_hersteller_id, auth.uid(), 'inhaber');
  return new_hersteller_id;
end;
$$;

grant execute on function public.create_hersteller_mit_inhaber(text) to authenticated;

-- ============================================================
-- 2. Produktkatalog - projektübergreifend für ALLE angemeldeten Nutzer
--    durchsuchbar (Marktplatz-Prinzip, wie im Vorbild Materialbank), aber
--    nur vom jeweiligen Hersteller selbst pflegbar.
-- ============================================================

create table hersteller_produkte (
  id uuid primary key default gen_random_uuid(),
  hersteller_id uuid not null references hersteller(id) on delete cascade,
  name text not null,
  kategorie text,
  beschreibung text,
  bild_url text,
  musterbestellbar boolean not null default true,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now()
);

-- ============================================================
-- 3. Musterbestellungen - von Projektbeteiligten (inkl. Bauherr ohne
--    Firma, siehe is_member_of_projekt) ausgelöst, vom Hersteller
--    bearbeitet. hersteller_id wird per Trigger aus dem Produkt
--    übernommen, damit sie nicht mit dem Produkt auseinanderlaufen kann.
-- ============================================================

create table musterbestellungen (
  id uuid primary key default gen_random_uuid(),
  produkt_id uuid not null references hersteller_produkte(id) on delete cascade,
  hersteller_id uuid not null references hersteller(id) on delete cascade,
  projekt_id uuid not null references projekte(id) on delete cascade,
  bestellt_von uuid references profile(id),
  lieferadresse text,
  notiz text,
  status text not null default 'angefragt' check (status in ('angefragt', 'bestaetigt', 'versendet', 'storniert')),
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);

create function public.musterbestellung_hersteller_setzen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select hersteller_id into new.hersteller_id from hersteller_produkte where id = new.produkt_id;
  new.aktualisiert_am := now();
  return new;
end;
$$;

create trigger musterbestellung_hersteller_setzen_trg
  before insert on musterbestellungen
  for each row execute function public.musterbestellung_hersteller_setzen();

create function public.musterbestellung_aktualisiert_am_setzen()
returns trigger
language plpgsql
as $$
begin
  new.aktualisiert_am := now();
  return new;
end;
$$;

create trigger musterbestellung_aktualisiert_am_trg
  before update on musterbestellungen
  for each row execute function public.musterbestellung_aktualisiert_am_setzen();

-- ============================================================
-- 4. Row-Level-Security
-- ============================================================

alter table hersteller enable row level security;
alter table hersteller_mitglieder enable row level security;
alter table hersteller_produkte enable row level security;
alter table musterbestellungen enable row level security;

-- Hersteller-Profile sind der Marktplatz-Auftritt - bewusst für alle
-- angemeldeten Nutzer lesbar (anders als "firmen", die nur eigene
-- Mitglieder sehen), damit Bauherr/Handwerker/GU im Katalog stöbern können.
create policy "Angemeldete sehen Herstellerprofile" on hersteller
  for select to authenticated using (true);
create policy "Hersteller-Admins bearbeiten eigenes Profil" on hersteller
  for update using (public.is_admin_of_hersteller(id));

create policy "Herstellermitglieder sehen ihre Mitgliedschaften" on hersteller_mitglieder
  for select using (public.is_member_of_hersteller(hersteller_id));
create policy "Hersteller-Admins verwalten Mitgliedschaften" on hersteller_mitglieder
  for insert with check (public.is_admin_of_hersteller(hersteller_id));
create policy "Hersteller-Admins aktualisieren Mitgliedschaften" on hersteller_mitglieder
  for update using (public.is_admin_of_hersteller(hersteller_id));
create policy "Hersteller-Admins entfernen Mitgliedschaften" on hersteller_mitglieder
  for delete using (public.is_admin_of_hersteller(hersteller_id));

create policy "Angemeldete durchsuchen aktiven Produktkatalog" on hersteller_produkte
  for select to authenticated using (aktiv or public.is_member_of_hersteller(hersteller_id));
create policy "Herstellermitglieder verwalten eigene Produkte" on hersteller_produkte
  for insert with check (public.is_member_of_hersteller(hersteller_id));
create policy "Herstellermitglieder aktualisieren eigene Produkte" on hersteller_produkte
  for update using (public.is_member_of_hersteller(hersteller_id));
create policy "Herstellermitglieder loeschen eigene Produkte" on hersteller_produkte
  for delete using (public.is_member_of_hersteller(hersteller_id));

create policy "Projektbeteiligte bestellen Muster" on musterbestellungen
  for insert with check (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte und Hersteller sehen Musterbestellungen" on musterbestellungen
  for select using (public.is_member_of_projekt(projekt_id) or public.is_member_of_hersteller(hersteller_id));
create policy "Projektbeteiligte und Hersteller aktualisieren Musterbestellungen" on musterbestellungen
  for update using (public.is_member_of_projekt(projekt_id) or public.is_member_of_hersteller(hersteller_id))
  with check (public.is_member_of_projekt(projekt_id) or public.is_member_of_hersteller(hersteller_id));

-- ============================================================
-- 5. Storage: eigener oeffentlicher Bucket fuer Produktfotos. Fuer
--    Hersteller-Logos wird bewusst der bereits bestehende, generische
--    "logos"-Bucket aus 0009_netzwerk.sql mitgenutzt statt ein Duplikat
--    anzulegen - dessen Policies erlauben Upload/Lesen bereits jeder
--    angemeldeten Person.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('hersteller-produkte', 'hersteller-produkte', true)
on conflict (id) do nothing;

create policy "Herstellerprodukte oeffentlich lesbar" on storage.objects
  for select using (bucket_id = 'hersteller-produkte');
create policy "Angemeldete laden Herstellerprodukte hoch" on storage.objects
  for insert to authenticated with check (bucket_id = 'hersteller-produkte');
create policy "Angemeldete aktualisieren Herstellerprodukte" on storage.objects
  for update to authenticated using (bucket_id = 'hersteller-produkte');
create policy "Angemeldete loeschen Herstellerprodukte" on storage.objects
  for delete to authenticated using (bucket_id = 'hersteller-produkte');
