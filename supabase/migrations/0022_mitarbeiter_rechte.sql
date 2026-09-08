-- Firmen-interne Rollen (existieren als firma_mitglieder.rolle schon seit
-- 0001_init.sql: inhaber, geschaeftsfuehrung, bauleitung, finanzen,
-- einkauf, mitarbeiter), aber wurden bisher nirgends ausgewertet - jedes
-- Firmenmitglied sah exakt dieselbe volle Oberfläche wie der Inhaber.
-- Diese Migration schränkt die beiden sensibelsten Bereiche ein:
-- Finanzen/Rechnungsstellung und den Preiskatalog. Team-Verwaltung
-- (firma_mitglieder/firma_einladungen) und das Bearbeiten der Firmendaten
-- selbst (Tabelle "firmen") sind bereits seit 0007/0008 über
-- is_admin_of_firma() auf inhaber/geschaeftsfuehrung beschränkt - das war
-- schon korrekt, nur im Frontend bisher nicht entsprechend ausgeblendet.

create function public.hat_finanz_zugriff(check_firma_id uuid)
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
      and rolle in ('inhaber', 'geschaeftsfuehrung', 'finanzen')
  );
$$;

create function public.hat_einkauf_zugriff(check_firma_id uuid)
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
      and rolle in ('inhaber', 'geschaeftsfuehrung', 'einkauf')
  );
$$;

-- Ausgangsrechnungen (Finanzen-Bereich, Konzept Abschnitt 8.7): bisher
-- durfte jedes Mitglied der Eigentümer-Firma sie sehen/bearbeiten
-- (0019_projekt_rechte.sql), jetzt nur noch wer finanziellen Zugriff hat.
drop policy if exists "Eigentümer sieht Ausgangsrechnungen" on rechnungen_ausgang;
drop policy if exists "Eigentümer verwaltet Ausgangsrechnungen" on rechnungen_ausgang;

create policy "Finanzrolle sieht Ausgangsrechnungen" on rechnungen_ausgang
  for select using (
    exists (
      select 1 from projekte p
      where p.id = rechnungen_ausgang.projekt_id and public.hat_finanz_zugriff(p.firma_id)
    )
  );
create policy "Finanzrolle verwaltet Ausgangsrechnungen" on rechnungen_ausgang
  for all using (
    exists (
      select 1 from projekte p
      where p.id = rechnungen_ausgang.projekt_id and public.hat_finanz_zugriff(p.firma_id)
    )
  ) with check (
    exists (
      select 1 from projekte p
      where p.id = rechnungen_ausgang.projekt_id and public.hat_finanz_zugriff(p.firma_id)
    )
  );

-- Preiskatalog (0017_preiskatalog.sql): weiterhin für alle Firmenmitglieder
-- lesbar (wird für Angebote gebraucht), aber nur noch Einkauf/Admins
-- dürfen ihn pflegen.
drop policy if exists "Firmenmitglieder verwalten eigenen Preiskatalog" on preiskatalog_positionen;

create policy "Einkaufsrolle verwaltet Preiskatalog" on preiskatalog_positionen
  for all using (public.hat_einkauf_zugriff(firma_id)) with check (public.hat_einkauf_zugriff(firma_id));
