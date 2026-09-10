-- Lücke aus dem echten Test (10.09.2026): Ein Freigabelimit ließ sich bisher
-- nur nachträglich setzen, nachdem eine eingeladene Person die Einladung
-- bereits angenommen hatte (erst dann existiert eine firma_mitglieder-Zeile
-- zum Bearbeiten). Julian wollte es direkt beim Einladen mitgeben, ohne
-- diesen Umweg. Jetzt trägt die Einladung selbst ein optionales Limit, das
-- beim Annehmen direkt in die neue Mitgliedschaft übernommen wird.

alter table firma_einladungen
  add column if not exists freigabe_limit_cents bigint;

create or replace function public.firma_einladung_erstellen(
  p_firma_id uuid,
  p_rolle text,
  p_abteilung text default null,
  p_freigabe_limit_cents bigint default null
)
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

  insert into firma_einladungen (firma_id, rolle, abteilung, freigabe_limit_cents, erstellt_von)
  values (p_firma_id, p_rolle, nullif(p_abteilung, ''), p_freigabe_limit_cents, auth.uid())
  returning token into neuer_token;

  return neuer_token;
end;
$$;

grant execute on function public.firma_einladung_erstellen(uuid, text, text, bigint) to authenticated;

create or replace function public.firma_einladung_annehmen(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  eingeladene_firma_id uuid;
  eingeladene_rolle text;
  eingeladene_abteilung text;
  eingeladenes_limit bigint;
  aktueller_status text;
begin
  select firma_id, rolle, abteilung, freigabe_limit_cents, status
    into eingeladene_firma_id, eingeladene_rolle, eingeladene_abteilung, eingeladenes_limit, aktueller_status
  from firma_einladungen
  where token = p_token
  for update;

  if eingeladene_firma_id is null then
    raise exception 'Einladung nicht gefunden';
  end if;
  if aktueller_status <> 'offen' then
    raise exception 'Diese Einladung ist nicht mehr gültig';
  end if;

  insert into firma_mitglieder (firma_id, nutzer_id, rolle, abteilung, freigabe_limit_cents)
  values (eingeladene_firma_id, auth.uid(), eingeladene_rolle, eingeladene_abteilung, eingeladenes_limit)
  on conflict (firma_id, nutzer_id) do nothing;

  update firma_einladungen
    set status = 'angenommen', angenommen_von_nutzer_id = auth.uid(), angenommen_am = now()
    where token = p_token;

  return eingeladene_firma_id;
end;
$$;

grant execute on function public.firma_einladung_annehmen(text) to authenticated;
