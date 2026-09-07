-- Einladungen für echte Firmen als Projektbeteiligte (mit eigenem Werkfluss-
-- Login), als Ergänzung zur einfachen Kontaktliste in projekt_beteiligte.
-- Ablauf: Projekteigner erzeugt einen Einladungslink (Token) für eine Rolle
-- (+ optional Gewerk). Die eingeladene Person öffnet den Link, meldet sich an
-- oder registriert sich, legt bei Bedarf ihre eigene Firma an, und wird dann
-- automatisch als projekt_mitglieder-Eintrag verknüpft.
-- Versand des Links läuft vorerst manuell (WhatsApp/E-Mail/etc.), da noch kein
-- eigener Mailversand (z.B. Resend) angebunden ist.

create table projekt_einladungen (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  rolle_im_projekt text not null check (rolle_im_projekt in ('generalunternehmer', 'handwerker', 'architekt', 'bauherr')),
  gewerk text,
  token text not null unique default encode(gen_random_bytes(20), 'hex'),
  status text not null default 'offen' check (status in ('offen', 'angenommen', 'zurueckgezogen')),
  erstellt_von uuid references profile(id),
  angenommen_von_firma_id uuid references firmen(id),
  angenommen_am timestamptz,
  erstellt_am timestamptz not null default now()
);

alter table projekt_einladungen enable row level security;

create policy "Projekteigner sehen Einladungen" on projekt_einladungen
  for select using (public.is_owner_of_projekt(projekt_id));
create policy "Projekteigner erstellen Einladungen" on projekt_einladungen
  for insert with check (public.is_owner_of_projekt(projekt_id));
create policy "Projekteigner aktualisieren Einladungen" on projekt_einladungen
  for update using (public.is_owner_of_projekt(projekt_id));
create policy "Projekteigner loeschen Einladungen" on projekt_einladungen
  for delete using (public.is_owner_of_projekt(projekt_id));

-- Einladung erzeugen (nur Projekteigner)
create function public.einladung_erstellen(p_projekt_id uuid, p_rolle text, p_gewerk text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  neuer_token text;
begin
  if not public.is_owner_of_projekt(p_projekt_id) then
    raise exception 'Keine Berechtigung für dieses Projekt';
  end if;

  insert into projekt_einladungen (projekt_id, rolle_im_projekt, gewerk, erstellt_von)
  values (p_projekt_id, p_rolle, nullif(p_gewerk, ''), auth.uid())
  returning token into neuer_token;

  return neuer_token;
end;
$$;

grant execute on function public.einladung_erstellen(uuid, text, text) to authenticated;

-- Einladung ansehen: öffentlich abrufbar (Vorschau vor Login/Registrierung),
-- gibt absichtlich nur unkritische Infos zurück, keine IDs.
create function public.einladung_ansehen(p_token text)
returns table (
  projekt_name text,
  firma_name text,
  rolle_im_projekt text,
  gewerk text,
  status text
)
language sql
security definer
stable
set search_path = public
as $$
  select p.name, f.name, e.rolle_im_projekt, e.gewerk, e.status
  from projekt_einladungen e
  join projekte p on p.id = e.projekt_id
  join firmen f on f.id = p.firma_id
  where e.token = p_token;
$$;

grant execute on function public.einladung_ansehen(text) to anon, authenticated;

-- Einladung annehmen: eingeloggter Nutzer mit eigener Firma verknüpft sich
-- selbst mit dem Projekt.
create function public.einladung_annehmen(p_token text, p_firma_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  eingeladenes_projekt_id uuid;
  eingeladene_rolle text;
  eingeladenes_gewerk text;
  aktueller_status text;
begin
  if not public.is_member_of_firma(p_firma_id) then
    raise exception 'Du bist kein Mitglied dieser Firma';
  end if;

  select projekt_id, rolle_im_projekt, gewerk, status
    into eingeladenes_projekt_id, eingeladene_rolle, eingeladenes_gewerk, aktueller_status
  from projekt_einladungen
  where token = p_token
  for update;

  if eingeladenes_projekt_id is null then
    raise exception 'Einladung nicht gefunden';
  end if;
  if aktueller_status <> 'offen' then
    raise exception 'Diese Einladung ist nicht mehr gültig';
  end if;

  insert into projekt_mitglieder (projekt_id, firma_id, nutzer_id, rolle_im_projekt, gewerk)
  values (eingeladenes_projekt_id, p_firma_id, auth.uid(), eingeladene_rolle, eingeladenes_gewerk)
  on conflict (projekt_id, firma_id, nutzer_id) do nothing;

  update projekt_einladungen
    set status = 'angenommen', angenommen_von_firma_id = p_firma_id, angenommen_am = now()
    where token = p_token;

  return eingeladenes_projekt_id;
end;
$$;

grant execute on function public.einladung_annehmen(text, uuid) to authenticated;
