-- Bauherr/Endkunde als eigener Account-Typ ohne Firma (Julians explizite
-- Entscheidung gegen die einfachere "unsichtbare Privat-Firma"-Lösung).
-- Bisher verlangte das Schema für JEDE Projektmitgliedschaft eine Firma
-- (projekt_mitglieder.firma_id not null) - ein privater Bauherr ohne
-- eigenen Handwerks-/Planungsbetrieb konnte technisch gar nicht als
-- Projektbeteiligter aufgenommen werden, ohne zuerst eine „Firma" für sich
-- selbst anzulegen. Das ändert diese Migration strukturell.

-- ============================================================
-- 1. firma_id in projekt_mitglieder darf jetzt leer sein
-- ============================================================

alter table projekt_mitglieder alter column firma_id drop not null;

alter table projekt_mitglieder
  add constraint projekt_mitglieder_firma_oder_nutzer
  check (firma_id is not null or nutzer_id is not null);

-- Ohne Firma identifiziert einzig nutzer_id die Mitgliedschaft eindeutig;
-- die bestehende unique(projekt_id, firma_id, nutzer_id) greift bei
-- firma_id = null nicht (NULL ist in Unique-Constraints nie „gleich"),
-- deshalb zusätzlich ein partieller Index nur für den firmenlosen Fall.
create unique index projekt_mitglieder_bauherr_eindeutig
  on projekt_mitglieder (projekt_id, nutzer_id)
  where firma_id is null;

-- ============================================================
-- 2. Hilfsfunktion: ist die aufrufende Person als Bauherr (ohne Firma)
--    Mitglied dieses Projekts? Grundlage für die eingeschränkten Rechte
--    unten (Bautagebuch nur lesend, Mängel nur melden statt bearbeiten).
-- ============================================================

create function public.ist_bauherr_im_projekt(check_projekt_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from projekt_mitglieder pm
    where pm.projekt_id = check_projekt_id
      and pm.nutzer_id = auth.uid()
      and pm.rolle_im_projekt = 'bauherr'
  );
$$;

-- ============================================================
-- 3. Einladung annehmen, ohne dass eine eigene Firma existiert (Pendant zu
--    einladung_annehmen(token, firma_id) aus 0006_projekt_einladungen.sql)
-- ============================================================

create function public.einladung_annehmen_bauherr(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  eingeladenes_projekt_id uuid;
  eingeladene_rolle text;
  aktueller_status text;
begin
  select projekt_id, rolle_im_projekt, status
    into eingeladenes_projekt_id, eingeladene_rolle, aktueller_status
  from projekt_einladungen
  where token = p_token
  for update;

  if eingeladenes_projekt_id is null then
    raise exception 'Einladung nicht gefunden';
  end if;
  if eingeladene_rolle <> 'bauherr' then
    raise exception 'Diese Einladung ist keine Bauherr-Einladung';
  end if;
  if aktueller_status <> 'offen' then
    raise exception 'Diese Einladung ist nicht mehr gültig';
  end if;

  insert into projekt_mitglieder (projekt_id, firma_id, nutzer_id, rolle_im_projekt, gewerk)
  values (eingeladenes_projekt_id, null, auth.uid(), 'bauherr', null)
  on conflict (projekt_id, nutzer_id) where firma_id is null do nothing;

  update projekt_einladungen
    set status = 'angenommen', angenommen_am = now()
    where token = p_token;

  return eingeladenes_projekt_id;
end;
$$;

grant execute on function public.einladung_annehmen_bauherr(text) to authenticated;

-- ============================================================
-- 4. Rechte einschränken: Bautagebuch ist für den Bauherrn "live einsehbar"
--    (Konzept Abschnitt 6), aber nicht selbst zu befüllen - das bleibt
--    Sache der ausführenden Firmen. Mängel darf er weiterhin melden
--    (bestehende Insert-Policy erlaubt das schon), aber nicht selbst
--    bearbeiten/den Status ändern - das ist Sache der zuständigen Firma.
-- ============================================================

drop policy if exists "Projektbeteiligte schreiben Bautagebuch" on bautagebuch_eintraege;
drop policy if exists "Projektbeteiligte bearbeiten Bautagebuch" on bautagebuch_eintraege;

create policy "Projektbeteiligte schreiben Bautagebuch" on bautagebuch_eintraege
  for insert with check (
    public.is_member_of_projekt(projekt_id) and not public.ist_bauherr_im_projekt(projekt_id)
  );
create policy "Projektbeteiligte bearbeiten Bautagebuch" on bautagebuch_eintraege
  for update using (
    public.is_member_of_projekt(projekt_id) and not public.ist_bauherr_im_projekt(projekt_id)
  );

drop policy if exists "Projektbeteiligte bearbeiten Mängel" on maengel;

create policy "Projektbeteiligte bearbeiten Mängel" on maengel
  for update using (
    public.is_member_of_projekt(projekt_id) and not public.ist_bauherr_im_projekt(projekt_id)
  );

-- ============================================================
-- 5. Einfache Planungsphase-Status-Übersicht für die Kundenansicht: ein
--    freies Notizfeld, das der Eigentümer (GU/Architekt-Firma) pflegt und
--    der Bauherr lesend sieht - bewusst schlank, ohne Plan-/Dokumenten-
--    Upload oder Freigabe-Workflow (das ist Teil des späteren, vollen
--    Projektmappe-/CAD-Ausbaus in Phase 3, Konzept Abschnitt 8.6/8.9).
-- ============================================================

alter table projekte add column if not exists planungsnotiz text;
