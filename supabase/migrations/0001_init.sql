-- Werkfluss – Phase 1 Kernschema
-- Basierend auf Architekturkonzept Abschnitt 4/5 und Hauptkonzept Abschnitt 15.
-- Deckt ab: Firmen/Mandanten, Team/Rollen, Projekte, Bautagebuch, Mängel,
-- Aufgaben, Angebote/Aufträge, Ausgangsrechnungen, Audit-Log.
-- Weitere Module (Buchhaltung/Banking, Ausschreibung/Vergabe-Marktplatz,
-- CAD/BIM, Zeitmanagement/Gantt, Förderung, Behörden) folgen in späteren
-- Migrationen, siehe Phasen-Roadmap im Hauptkonzept Abschnitt 16.

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. Firmen (Mandanten) & Nutzerprofile
-- ============================================================

create table firmen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rechtsform text,
  adresse text,
  ust_id text,
  erstellt_am timestamptz not null default now()
);

-- Spiegelt auth.users 1:1, damit wir Namen/Kontaktdaten ohne Zugriff
-- auf das geschützte auth-Schema abfragen können.
create table profile (
  id uuid primary key references auth.users(id) on delete cascade,
  vollname text not null default '',
  email text not null,
  telefon text,
  erstellt_am timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, vollname, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'vollname', ''), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nutzer <-> Firma (ein Nutzer kann in mehreren Firmen Mitglied sein,
-- z.B. als Subunternehmer in Projekt A, Hauptauftragnehmer in Projekt B).
create table firma_mitglieder (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firmen(id) on delete cascade,
  nutzer_id uuid not null references profile(id) on delete cascade,
  rolle text not null check (rolle in ('inhaber', 'geschaeftsfuehrung', 'bauleitung', 'finanzen', 'einkauf', 'mitarbeiter')),
  abteilung text,
  freigabe_limit_cents bigint,
  erstellt_am timestamptz not null default now(),
  unique (firma_id, nutzer_id)
);

-- ============================================================
-- 2. RLS-Hilfsfunktionen (security definer, um rekursive Policies zu vermeiden)
-- ============================================================

create function public.is_member_of_firma(check_firma_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from firma_mitglieder
    where firma_id = check_firma_id and nutzer_id = auth.uid()
  );
$$;

create function public.is_admin_of_firma(check_firma_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from firma_mitglieder
    where firma_id = check_firma_id
      and nutzer_id = auth.uid()
      and rolle in ('inhaber', 'geschaeftsfuehrung')
  );
$$;

-- Firma anlegen + anlegenden Nutzer als Inhaber eintragen, atomar.
create function public.create_firma_mit_inhaber(firma_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_firma_id uuid;
begin
  insert into firmen (name) values (firma_name) returning id into new_firma_id;
  insert into firma_mitglieder (firma_id, nutzer_id, rolle) values (new_firma_id, auth.uid(), 'inhaber');
  return new_firma_id;
end;
$$;

grant execute on function public.create_firma_mit_inhaber(text) to authenticated;

-- ============================================================
-- 3. Projekte
-- ============================================================

create table projekte (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firmen(id) on delete cascade,
  name text not null,
  vorhabenart text check (vorhabenart in ('neubau', 'sanierung', 'anbau')),
  gebaeudeklasse text,
  status text not null default 'planung' check (status in ('planung', 'ausfuehrung', 'abnahme', 'abgeschlossen', 'pausiert')),
  adresse text,
  start_datum date,
  end_datum_geplant date,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

-- Weitere Firmen/Nutzer, die an einem Projekt beteiligt sind
-- (z.B. Subunternehmer, Architekt, Bauherr), mit eigener Rolle je Projekt.
create table projekt_mitglieder (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  firma_id uuid not null references firmen(id) on delete cascade,
  nutzer_id uuid references profile(id),
  rolle_im_projekt text not null check (rolle_im_projekt in ('generalunternehmer', 'handwerker', 'architekt', 'bauherr')),
  gewerk text,
  erstellt_am timestamptz not null default now(),
  unique (projekt_id, firma_id, nutzer_id)
);

create function public.is_member_of_projekt(check_projekt_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from projekte p
    where p.id = check_projekt_id
      and (
        public.is_member_of_firma(p.firma_id)
        or exists (
          select 1 from projekt_mitglieder pm
          where pm.projekt_id = p.id
            and (pm.nutzer_id = auth.uid() or public.is_member_of_firma(pm.firma_id))
        )
      )
  );
$$;

create function public.is_owner_of_projekt(check_projekt_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from projekte p
    where p.id = check_projekt_id and public.is_member_of_firma(p.firma_id)
  );
$$;

-- ============================================================
-- 4. Bautagebuch, Mängel, Aufgaben
-- ============================================================

create table bautagebuch_eintraege (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  autor_id uuid references profile(id),
  datum date not null default current_date,
  wetter text,
  temperatur_grad numeric,
  anwesende_gewerke text[],
  taetigkeiten text not null,
  besonderheiten text,
  fotos jsonb not null default '[]'::jsonb,
  erstellt_am timestamptz not null default now()
);

create table maengel (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  titel text not null,
  beschreibung text,
  dringlichkeit text not null default 'mittel' check (dringlichkeit in ('kritisch', 'mittel', 'gering')),
  status text not null default 'offen' check (status in ('offen', 'in_bearbeitung', 'behoben', 'abgenommen')),
  zustaendiges_gewerk text,
  grundriss_x numeric,
  grundriss_y numeric,
  frist date,
  gemeldet_von uuid references profile(id),
  fotos jsonb not null default '[]'::jsonb,
  erstellt_am timestamptz not null default now()
);

create table aufgaben (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  titel text not null,
  beschreibung text,
  gewerk text,
  status text not null default 'offen' check (status in ('offen', 'in_bearbeitung', 'erledigt')),
  faellig_am date,
  zugewiesen_an uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

-- ============================================================
-- 5. Angebote, Aufträge, Ausgangsrechnungen
-- ============================================================

create table angebote (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  anbietende_firma_id uuid not null references firmen(id),
  gewerk text,
  summe_netto_cents bigint not null,
  mwst_satz numeric not null default 19,
  status text not null default 'entwurf' check (status in ('entwurf', 'versendet', 'angenommen', 'abgelehnt')),
  gueltig_bis date,
  erstellt_am timestamptz not null default now()
);

create table auftraege (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  angebot_id uuid references angebote(id),
  auftragnehmer_firma_id uuid not null references firmen(id),
  summe_netto_cents bigint not null,
  status text not null default 'aktiv' check (status in ('aktiv', 'abgeschlossen', 'storniert')),
  erstellt_am timestamptz not null default now()
);

create table rechnungen_ausgang (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  auftrag_id uuid references auftraege(id),
  rechnungsnummer text not null,
  typ text not null default 'abschlag' check (typ in ('abschlag', 'schluss', 'sonstige')),
  summe_netto_cents bigint not null,
  mwst_satz numeric not null default 19,
  status text not null default 'offen' check (status in ('offen', 'bezahlt', 'ueberfaellig', 'storniert')),
  faellig_am date,
  erstellt_am timestamptz not null default now()
);

-- ============================================================
-- 6. Audit-Log (Grundlage für GoBD-Nachvollziehbarkeit, Architekturkonzept Abschnitt 4)
-- ============================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid references firmen(id),
  nutzer_id uuid references profile(id),
  aktion text not null,
  entitaet text not null,
  entitaet_id uuid,
  details jsonb,
  erstellt_am timestamptz not null default now()
);

-- ============================================================
-- 7. Row-Level-Security aktivieren + Policies
-- ============================================================

alter table firmen enable row level security;
alter table profile enable row level security;
alter table firma_mitglieder enable row level security;
alter table projekte enable row level security;
alter table projekt_mitglieder enable row level security;
alter table bautagebuch_eintraege enable row level security;
alter table maengel enable row level security;
alter table aufgaben enable row level security;
alter table angebote enable row level security;
alter table auftraege enable row level security;
alter table rechnungen_ausgang enable row level security;
alter table audit_log enable row level security;

create policy "Mitglieder sehen ihre Firma" on firmen
  for select using (public.is_member_of_firma(id));

create policy "Nutzer sieht eigenes Profil" on profile
  for select using (id = auth.uid());
create policy "Nutzer bearbeitet eigenes Profil" on profile
  for update using (id = auth.uid());

create policy "Mitglieder sehen Mitgliedschaften ihrer Firma" on firma_mitglieder
  for select using (public.is_member_of_firma(firma_id));
create policy "Admins verwalten Mitgliedschaften" on firma_mitglieder
  for insert with check (public.is_admin_of_firma(firma_id));
create policy "Admins aktualisieren Mitgliedschaften" on firma_mitglieder
  for update using (public.is_admin_of_firma(firma_id));
create policy "Admins entfernen Mitgliedschaften" on firma_mitglieder
  for delete using (public.is_admin_of_firma(firma_id));

create policy "Projektbeteiligte sehen Projekt" on projekte
  for select using (public.is_member_of_projekt(id));
create policy "Firmenmitglieder legen Projekt an" on projekte
  for insert with check (public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder bearbeiten Projekt" on projekte
  for update using (public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder löschen Projekt" on projekte
  for delete using (public.is_member_of_firma(firma_id));

create policy "Projektbeteiligte sehen Projektmitglieder" on projekt_mitglieder
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projekteigner verwalten Projektmitglieder" on projekt_mitglieder
  for all using (public.is_owner_of_projekt(projekt_id)) with check (public.is_owner_of_projekt(projekt_id));

-- Gemeinsames Muster für alle projektgebundenen Fachtabellen:
-- sichtbar/bearbeitbar für alle am Projekt Beteiligten.
-- Feinere Freigabekompetenzen (Abschnitt 8.14 im Hauptkonzept) folgen in
-- einer späteren Migration, sobald Abteilungen/Freigabelimits im UI ankommen.

create policy "Projektbeteiligte sehen Bautagebuch" on bautagebuch_eintraege
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte schreiben Bautagebuch" on bautagebuch_eintraege
  for insert with check (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte bearbeiten Bautagebuch" on bautagebuch_eintraege
  for update using (public.is_member_of_projekt(projekt_id));

create policy "Projektbeteiligte sehen Mängel" on maengel
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte melden Mängel" on maengel
  for insert with check (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte bearbeiten Mängel" on maengel
  for update using (public.is_member_of_projekt(projekt_id));

create policy "Projektbeteiligte sehen Aufgaben" on aufgaben
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten Aufgaben" on aufgaben
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

create policy "Projektbeteiligte sehen Angebote" on angebote
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten Angebote" on angebote
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

create policy "Projektbeteiligte sehen Aufträge" on auftraege
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten Aufträge" on auftraege
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

create policy "Projektbeteiligte sehen Ausgangsrechnungen" on rechnungen_ausgang
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte verwalten Ausgangsrechnungen" on rechnungen_ausgang
  for all using (public.is_member_of_projekt(projekt_id)) with check (public.is_member_of_projekt(projekt_id));

create policy "Mitglieder sehen Audit-Log ihrer Firma" on audit_log
  for select using (firma_id is null or public.is_member_of_firma(firma_id));
create policy "Mitglieder schreiben Audit-Log ihrer Firma" on audit_log
  for insert with check (firma_id is null or public.is_member_of_firma(firma_id));
