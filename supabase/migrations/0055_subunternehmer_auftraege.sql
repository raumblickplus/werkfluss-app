-- Subunternehmer-Übersicht (Julian-Backlog 10.09.2026, Teil 1: "Sowohl der
-- Generalunternehmer als auch jeder Handwerksbetrieb, der selbst mit
-- Subunternehmern arbeitet, soll eine eigene Übersicht/Spalte seiner
-- Subunternehmer bekommen - nicht nur GU-exklusiv"; Vorschlag vom
-- 11.09.2026 mit Julian abgestimmt).
--
-- Bisher konnte ausschließlich der Projekteigentümer (GU) überhaupt einen
-- Auftrag anlegen (0019/0029) - auftraege wusste auch gar nicht, WER einen
-- Auftrag vergeben hat, nur wer ihn bekommen hat (auftragnehmer_firma_id).
-- Diese Migration ergänzt auftraggeber_firma_id (Backfill: bisherige
-- Aufträge = vom Projekteigentümer vergeben) und lockert "Aufträge
-- anlegen" so, dass auch eine Firma, die in diesem Projekt bereits selbst
-- einen laufenden Auftrag hat (also nachweislich Teil der Auftragskette
-- ist), ihrerseits Subunternehmer beauftragen darf - nicht irgendeine
-- beliebige Firma. Die bestehende Freigabegrenze (0029,
-- firma_mitglieder.freigabe_limit_cents) gilt dabei für die jeweils
-- vergebende Firma statt immer für den Generalunternehmer.
--
-- Bewusst NICHT Teil dieser Migration (mit Julian abgestimmt):
-- - Eine komplett neue, bisher am Projekt unbeteiligte Firma einladen, um
--   sie zu beauftragen - das würde den bestehenden Einladungsmechanismus
--   (projekt_mitglieder) mitbetreffen und ist ein eigener, größerer
--   Schritt. Für den ersten Wurf kann eine Firma nur Subunternehmer
--   beauftragen, die bereits als "handwerker" am Projekt beteiligt sind.
-- - Die Ausschreibung/LV-Pipeline (0013/0017) bleibt weiterhin exklusiv
--   dem Projekteigentümer vorbehalten - eine Firma vergibt Subunternehmer-
--   Aufträge über ein einfaches Direktformular (Firma + Summe), nicht über
--   eine eigene Ausschreibung mit Angebotsvergleich.
-- - rechnungen_ausgang bleibt ausschließlich an die Finanzrolle der
--   GU-Firma gebunden (0022) - eine Rechnungsstellung zwischen zwei
--   nicht-GU-Firmen innerhalb der Kette ist damit weiterhin außerhalb der
--   App abzuwickeln.

alter table auftraege add column if not exists auftraggeber_firma_id uuid references firmen(id);

update auftraege a
set auftraggeber_firma_id = p.firma_id
from projekte p
where p.id = a.projekt_id and a.auftraggeber_firma_id is null;

alter table auftraege alter column auftraggeber_firma_id set not null;

-- Freigabegrenze für eine beliebige vergebende Firma statt (wie
-- hat_freigabe_fuer, 0029) fest für die Projekteigentümer-Firma.
create function public.hat_freigabe_fuer_firma(check_firma_id uuid, betrag_cents bigint)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from firma_mitglieder fm
    where fm.firma_id = check_firma_id
      and fm.nutzer_id = auth.uid()
      and (
        fm.rolle in ('inhaber', 'geschaeftsfuehrung')
        or fm.freigabe_limit_cents >= betrag_cents
      )
  );
$$;

grant execute on function public.hat_freigabe_fuer_firma(uuid, bigint) to authenticated;

-- Ist diese Firma in diesem Projekt bereits selbst Auftragnehmerin eines
-- laufenden Auftrags (also nachweislich Teil der Auftragskette) und darf
-- deshalb ihrerseits Subunternehmer beauftragen?
create function public.ist_auftragnehmer_im_projekt(check_projekt_id uuid, check_firma_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from auftraege a
    where a.projekt_id = check_projekt_id
      and a.auftragnehmer_firma_id = check_firma_id
      and a.status <> 'storniert'
  );
$$;

grant execute on function public.ist_auftragnehmer_im_projekt(uuid, uuid) to authenticated;

drop policy if exists "Aufträge sehen" on auftraege;
drop policy if exists "Aufträge anlegen" on auftraege;
drop policy if exists "Aufträge aktualisieren" on auftraege;
drop policy if exists "Aufträge löschen" on auftraege;

create policy "Aufträge sehen" on auftraege
  for select using (
    public.is_owner_of_projekt(projekt_id)
    or public.is_member_of_firma(auftragnehmer_firma_id)
    or public.is_member_of_firma(auftraggeber_firma_id)
  );

create policy "Aufträge anlegen" on auftraege
  for insert with check (
    public.is_member_of_firma(auftraggeber_firma_id)
    and (
      public.is_owner_of_projekt(projekt_id)
      or public.ist_auftragnehmer_im_projekt(projekt_id, auftraggeber_firma_id)
    )
    and public.hat_freigabe_fuer_firma(auftraggeber_firma_id, summe_netto_cents)
  );

create policy "Aufträge aktualisieren" on auftraege
  for update using (
    public.is_owner_of_projekt(projekt_id)
    or public.is_member_of_firma(auftragnehmer_firma_id)
    or public.is_member_of_firma(auftraggeber_firma_id)
  ) with check (
    public.is_owner_of_projekt(projekt_id)
    or public.is_member_of_firma(auftragnehmer_firma_id)
    or public.is_member_of_firma(auftraggeber_firma_id)
  );

create policy "Aufträge löschen" on auftraege
  for delete using (
    public.is_owner_of_projekt(projekt_id)
    or public.is_member_of_firma(auftraggeber_firma_id)
  );
