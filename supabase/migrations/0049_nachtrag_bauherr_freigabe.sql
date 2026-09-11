-- Bauherr-Freigabe für Nachträge (Konzept Abschnitt 8.6/9): die digitale
-- Projektmappe soll dem Bauherrn "offene Freigaben" zeigen, als Teil des
-- Transparenz-Grundsatzes ("ohne nachfragen zu müssen", Abschnitt 9). Ein
-- Nachtrag (0031_nachtraege.sql) erhöht oder senkt die vereinbarte Summe
-- eines Auftrags - bisher entscheidet darüber ausschließlich der
-- Eigentümer/GU über nachtrag_entscheiden(), der eigentlich zahlende
-- Bauherr wird nirgends gefragt oder auch nur informiert (die Beteiligte-
-- sehen-Nachträge-Policy aus 0031 kennt gar keine Bauherr-Rolle).
--
-- Bewusst als PARALLELE, eigene Freigabespur modelliert (bauherr_status),
-- NICHT als Sperre vor nachtrag_entscheiden(): die bereits produktiv
-- laufende interne Freigabekompetenz-Prüfung (0029/0031) wird hier nicht
-- verändert, um ein etabliertes, schon von Julian selbst getestetes
-- Verhalten nicht ungefragt umzustellen. Der Bauherr bekommt also ein
-- echtes, wirksames Freigabe-/Ablehnungsrecht mit eigenem Zeitstempel und
-- eigener Person - aber ob diese Entscheidung später zur Voraussetzung für
-- die interne Freigabe gemacht wird, ist eine bewusste Folgeentscheidung,
-- kein technisches Detail, das hier im Vorbeigehen mitentschieden werden
-- sollte.
--
-- bauherr_status startet nicht immer bei "ausstehend": ein Projekt ohne
-- Bauherr-Mitglied (z.B. reine GU-Subunternehmer-Auftragskette) hat keinen
-- Bauherrn, der entscheiden könnte - dafür 'nicht_erforderlich' per Trigger.

alter table nachtraege add column bauherr_status text not null default 'nicht_erforderlich'
  check (bauherr_status in ('nicht_erforderlich', 'ausstehend', 'freigegeben', 'abgelehnt'));
alter table nachtraege add column bauherr_entschieden_von uuid references profile(id);
alter table nachtraege add column bauherr_entschieden_am timestamptz;

create function public.nachtrag_bauherr_status_setzen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from projekt_mitglieder
    where projekt_id = new.projekt_id and rolle_im_projekt = 'bauherr'
  ) then
    new.bauherr_status := 'ausstehend';
  else
    new.bauherr_status := 'nicht_erforderlich';
  end if;
  return new;
end;
$$;

create trigger nachtrag_bauherr_status_beim_einreichen
  before insert on nachtraege
  for each row execute function public.nachtrag_bauherr_status_setzen();

create policy "Bauherr sieht eigene Nachträge" on nachtraege
  for select using (public.ist_bauherr_von_projekt(projekt_id));

create function public.nachtrag_bauherr_entscheiden(p_nachtrag_id uuid, p_freigeben boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n_projekt_id uuid;
  n_bauherr_status text;
begin
  select projekt_id, bauherr_status into n_projekt_id, n_bauherr_status
  from nachtraege
  where id = p_nachtrag_id
  for update;

  if n_projekt_id is null then
    raise exception 'Nachtrag nicht gefunden';
  end if;
  if not public.ist_bauherr_von_projekt(n_projekt_id) then
    raise exception 'Keine Berechtigung für diesen Nachtrag';
  end if;
  if n_bauherr_status <> 'ausstehend' then
    raise exception 'Dieser Nachtrag wurde bereits entschieden oder erfordert keine Freigabe';
  end if;

  update nachtraege
  set bauherr_status = case when p_freigeben then 'freigegeben' else 'abgelehnt' end,
      bauherr_entschieden_von = auth.uid(),
      bauherr_entschieden_am = now()
  where id = p_nachtrag_id;
end;
$$;

grant execute on function public.nachtrag_bauherr_entscheiden(uuid, boolean) to authenticated;
