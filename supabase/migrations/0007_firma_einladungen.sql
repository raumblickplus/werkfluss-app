-- Einladungen für Kolleg:innen in die EIGENE Firma (Team), als Ergänzung zu
-- projekt_einladungen (Migration 0006), die andere Firmen zu einem Projekt
-- einladen. Ablauf: Firmen-Admin (inhaber/geschaeftsfuehrung) erzeugt einen
-- Einladungslink (Token) für eine Rolle (+ optional Abteilung). Die
-- eingeladene Person öffnet den Link, meldet sich an oder registriert sich,
-- und wird DIREKT als firma_mitglieder-Eintrag der einladenden Firma
-- verknüpft – im Unterschied zu projekt_einladungen muss sie dafür keine
-- eigene Firma anlegen.
-- Versand des Links läuft vorerst manuell (WhatsApp/E-Mail/etc.), da noch
-- kein eigener Mailversand (z.B. Resend) angebunden ist.

create table firma_einladungen (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firmen(id) on delete cascade,
  rolle text not null check (rolle in ('inhaber', 'geschaeftsfuehrung', 'bauleitung', 'finanzen', 'einkauf', 'mitarbeiter')),
  abteilung text,
  token text not null unique default encode(gen_random_bytes(20), 'hex'),
  status text not null default 'offen' check (status in ('offen', 'angenommen', 'zurueckgezogen')),
  erstellt_von uuid references profile(id),
  angenommen_von_nutzer_id uuid references profile(id),
  angenommen_am timestamptz,
  erstellt_am timestamptz not null default now()
);

alter table firma_einladungen enable row level security;

create policy "Admins sehen Team-Einladungen" on firma_einladungen
  for select using (public.is_admin_of_firma(firma_id));
create policy "Admins erstellen Team-Einladungen" on firma_einladungen
  for insert with check (public.is_admin_of_firma(firma_id));
create policy "Admins aktualisieren Team-Einladungen" on firma_einladungen
  for update using (public.is_admin_of_firma(firma_id));
create policy "Admins loeschen Team-Einladungen" on firma_einladungen
  for delete using (public.is_admin_of_firma(firma_id));

-- Einladung erzeugen (nur Firmen-Admins)
create function public.firma_einladung_erstellen(p_firma_id uuid, p_rolle text, p_abteilung text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  neuer_token text;
begin
  if not public.is_admin_of_firma(p_firma_id) then
    raise exception 'Keine Berechtigung für diese Firma';
  end if;

  insert into firma_einladungen (firma_id, rolle, abteilung, erstellt_von)
  values (p_firma_id, p_rolle, nullif(p_abteilung, ''), auth.uid())
  returning token into neuer_token;

  return neuer_token;
end;
$$;

grant execute on function public.firma_einladung_erstellen(uuid, text, text) to authenticated;

-- Einladung ansehen: öffentlich abrufbar (Vorschau vor Login/Registrierung),
-- gibt absichtlich nur unkritische Infos zurück, keine IDs.
create function public.firma_einladung_ansehen(p_token text)
returns table (
  firma_name text,
  rolle text,
  abteilung text,
  status text
)
language sql
security definer
stable
set search_path = public
as $$
  select f.name, e.rolle, e.abteilung, e.status
  from firma_einladungen e
  join firmen f on f.id = e.firma_id
  where e.token = p_token;
$$;

grant execute on function public.firma_einladung_ansehen(text) to anon, authenticated;

-- Einladung annehmen: eingeloggter Nutzer wird direkt Mitglied der
-- einladenden Firma (braucht dafür keine eigene Firma).
create function public.firma_einladung_annehmen(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  eingeladene_firma_id uuid;
  eingeladene_rolle text;
  eingeladene_abteilung text;
  aktueller_status text;
begin
  select firma_id, rolle, abteilung, status
    into eingeladene_firma_id, eingeladene_rolle, eingeladene_abteilung, aktueller_status
  from firma_einladungen
  where token = p_token
  for update;

  if eingeladene_firma_id is null then
    raise exception 'Einladung nicht gefunden';
  end if;
  if aktueller_status <> 'offen' then
    raise exception 'Diese Einladung ist nicht mehr gültig';
  end if;

  insert into firma_mitglieder (firma_id, nutzer_id, rolle, abteilung)
  values (eingeladene_firma_id, auth.uid(), eingeladene_rolle, eingeladene_abteilung)
  on conflict (firma_id, nutzer_id) do nothing;

  update firma_einladungen
    set status = 'angenommen', angenommen_von_nutzer_id = auth.uid(), angenommen_am = now()
    where token = p_token;

  return eingeladene_firma_id;
end;
$$;

grant execute on function public.firma_einladung_annehmen(text) to authenticated;
