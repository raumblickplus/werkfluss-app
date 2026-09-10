-- Freigabekompetenzen (Konzept Abschnitt 8.14): firma_mitglieder.freigabe_limit_cents
-- existiert bereits seit 0001_init.sql, wurde aber nirgends gepflegt oder
-- ausgewertet - jedes Mitglied konnte technisch jeden Auftrag in beliebiger
-- Höhe erteilen, unabhängig von Rolle oder hinterlegtem Limit. Diese Migration
-- macht daraus eine echte Regel am Punkt, an dem sich die Firma verbindlich
-- zur Zahlung an einen Auftragnehmer verpflichtet: der Auftragserstellung aus
-- einem angenommenen Angebot (Ausschreibung.tsx/Angebote.tsx, "Auftrag
-- erstellen").
--
-- Regel: Inhaber und Geschäftsführung dürfen Aufträge in beliebiger Höhe
-- erteilen. Alle anderen Mitglieder nur bis zu ihrem hinterlegten
-- freigabe_limit_cents. Ist kein Limit hinterlegt (NULL), darf das Mitglied
-- keinen Auftrag erteilen - 0/kein Zugriff ist der sichere Standard, nicht
-- "unbegrenzt".

create function public.hat_freigabe_fuer(check_projekt_id uuid, betrag_cents bigint)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from projekte p
    join firma_mitglieder fm on fm.firma_id = p.firma_id
    where p.id = check_projekt_id
      and fm.nutzer_id = auth.uid()
      and (
        fm.rolle in ('inhaber', 'geschaeftsfuehrung')
        or fm.freigabe_limit_cents >= betrag_cents
      )
  );
$$;

grant execute on function public.hat_freigabe_fuer(uuid, bigint) to authenticated;

drop policy if exists "Aufträge anlegen" on auftraege;

create policy "Aufträge anlegen" on auftraege
  for insert with check (
    public.is_owner_of_projekt(projekt_id)
    and public.hat_freigabe_fuer(projekt_id, summe_netto_cents)
  );
