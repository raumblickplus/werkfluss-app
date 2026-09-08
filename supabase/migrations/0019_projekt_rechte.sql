-- Rollen-/Rechte-Trennung zwischen Projekt-Eigentümer (Generalunternehmer,
-- projekte.firma_id) und Projekt-Teilnehmern (Handwerker, Architekt, Sub-
-- unternehmer als projekt_mitglieder). Anlass: die App war bisher komplett
-- auf die GU-Perspektive zugeschnitten - jeder Projektbeteiligte sah und
-- bearbeitete alles gleichermaßen. Konkret hieß das z.B., dass ein
-- eingeladener Handwerker die Angebotspreise anderer, konkurrierender
-- Firmen für dasselbe Gewerk einsehen und sogar ändern konnte.
--
-- Prinzip ab jetzt: der Eigentümer (is_owner_of_projekt, existiert bereits
-- seit 0001_init.sql) behält vollen Zugriff auf alles im Projekt. Ein
-- Teilnehmer sieht/verwaltet nur noch, was zu seiner eigenen Firma gehört
-- bzw. zu seinem eigenen Gewerk passt.

-- ============================================================
-- Angebote: nur noch eigenes Angebot sichtbar/bearbeitbar für Teilnehmer
-- ============================================================

drop policy if exists "Projektbeteiligte sehen Angebote" on angebote;
drop policy if exists "Projektbeteiligte verwalten Angebote" on angebote;

create policy "Angebote sehen" on angebote
  for select using (
    public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(anbietende_firma_id)
  );
create policy "Angebote anlegen" on angebote
  for insert with check (
    public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(anbietende_firma_id)
  );
create policy "Angebote aktualisieren" on angebote
  for update using (
    public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(anbietende_firma_id)
  ) with check (
    -- Der Eigentümer darf den Status frei setzen (annehmen/ablehnen), eine
    -- anbietende Firma nur bis "versendet" - das eigene Angebot annehmen
    -- oder ablehnen ist bewusst nicht erlaubt, das ist Sache des GU.
    public.is_owner_of_projekt(projekt_id)
    or (public.is_member_of_firma(anbietende_firma_id) and status in ('entwurf', 'versendet'))
  );
create policy "Angebote löschen" on angebote
  for delete using (
    public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(anbietende_firma_id)
  );

-- Angebotspositionen folgen derselben Sichtbarkeit wie ihr Angebot.
drop policy if exists "Projektbeteiligte sehen Angebotspositionen" on angebot_positionen;
drop policy if exists "Projektbeteiligte verwalten Angebotspositionen" on angebot_positionen;

create policy "Angebotspositionen sehen" on angebot_positionen
  for select using (
    exists (
      select 1 from angebote a
      where a.id = angebot_positionen.angebot_id
        and (public.is_owner_of_projekt(a.projekt_id) or public.is_member_of_firma(a.anbietende_firma_id))
    )
  );
create policy "Angebotspositionen verwalten" on angebot_positionen
  for all using (
    exists (
      select 1 from angebote a
      where a.id = angebot_positionen.angebot_id
        and (public.is_owner_of_projekt(a.projekt_id) or public.is_member_of_firma(a.anbietende_firma_id))
    )
  ) with check (
    exists (
      select 1 from angebote a
      where a.id = angebot_positionen.angebot_id
        and (public.is_owner_of_projekt(a.projekt_id) or public.is_member_of_firma(a.anbietende_firma_id))
    )
  );

-- ============================================================
-- Aufträge: Vergabe (anlegen/löschen) bleibt Sache des Eigentümers, die
-- ausführende Firma sieht ihren eigenen Auftrag und darf den Status
-- pflegen (z.B. auf "abgeschlossen" setzen).
-- ============================================================

drop policy if exists "Projektbeteiligte sehen Aufträge" on auftraege;
drop policy if exists "Projektbeteiligte verwalten Aufträge" on auftraege;

create policy "Aufträge sehen" on auftraege
  for select using (
    public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(auftragnehmer_firma_id)
  );
create policy "Aufträge anlegen" on auftraege
  for insert with check (public.is_owner_of_projekt(projekt_id));
create policy "Aufträge aktualisieren" on auftraege
  for update using (
    public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(auftragnehmer_firma_id)
  ) with check (
    public.is_owner_of_projekt(projekt_id) or public.is_member_of_firma(auftragnehmer_firma_id)
  );
create policy "Aufträge löschen" on auftraege
  for delete using (public.is_owner_of_projekt(projekt_id));

-- ============================================================
-- Leistungsverzeichnis: weiterhin für alle Projektbeteiligten lesbar (sie
-- müssen die Ausschreibung sehen, um ein Angebot dazu abzugeben), aber nur
-- der Eigentümer (GU) darf Positionen anlegen/ändern/löschen.
-- ============================================================

drop policy if exists "Projektbeteiligte verwalten LV-Positionen" on lv_positionen;

create policy "Eigentümer verwaltet LV-Positionen" on lv_positionen
  for all using (public.is_owner_of_projekt(projekt_id)) with check (public.is_owner_of_projekt(projekt_id));

-- ============================================================
-- Ausgangsrechnungen (an den Bauherrn): das ist reine GU-Rechnungsstellung,
-- geht Handwerker/Architekt/Subunternehmer nichts an - es gibt (noch) kein
-- eigenes Konzept für Rechnungen von Subunternehmern an den GU.
-- ============================================================

drop policy if exists "Projektbeteiligte sehen Ausgangsrechnungen" on rechnungen_ausgang;
drop policy if exists "Projektbeteiligte verwalten Ausgangsrechnungen" on rechnungen_ausgang;

create policy "Eigentümer sieht Ausgangsrechnungen" on rechnungen_ausgang
  for select using (public.is_owner_of_projekt(projekt_id));
create policy "Eigentümer verwaltet Ausgangsrechnungen" on rechnungen_ausgang
  for all using (public.is_owner_of_projekt(projekt_id)) with check (public.is_owner_of_projekt(projekt_id));

-- ============================================================
-- Aufgaben: der Eigentümer sieht/verwaltet alle Aufgaben des Projekts. Ein
-- Teilnehmer sieht Aufgaben ohne Gewerk (allgemeine Aufgaben) sowie
-- Aufgaben seines eigenen Gewerks (aus projekt_mitglieder.gewerk), und darf
-- nur diese eigenen Gewerk-Aufgaben selbst verwalten.
-- ============================================================

drop policy if exists "Projektbeteiligte sehen Aufgaben" on aufgaben;
drop policy if exists "Projektbeteiligte verwalten Aufgaben" on aufgaben;

create policy "Aufgaben sehen" on aufgaben
  for select using (
    public.is_owner_of_projekt(projekt_id)
    or (
      public.is_member_of_projekt(projekt_id)
      and (
        aufgaben.gewerk is null
        or exists (
          select 1 from projekt_mitglieder pm
          where pm.projekt_id = aufgaben.projekt_id
            and pm.gewerk = aufgaben.gewerk
            and (pm.nutzer_id = auth.uid() or public.is_member_of_firma(pm.firma_id))
        )
      )
    )
  );
create policy "Aufgaben verwalten" on aufgaben
  for all using (
    public.is_owner_of_projekt(projekt_id)
    or exists (
      select 1 from projekt_mitglieder pm
      where pm.projekt_id = aufgaben.projekt_id
        and pm.gewerk = aufgaben.gewerk
        and (pm.nutzer_id = auth.uid() or public.is_member_of_firma(pm.firma_id))
    )
  ) with check (
    public.is_owner_of_projekt(projekt_id)
    or exists (
      select 1 from projekt_mitglieder pm
      where pm.projekt_id = aufgaben.projekt_id
        and pm.gewerk = aufgaben.gewerk
        and (pm.nutzer_id = auth.uid() or public.is_member_of_firma(pm.firma_id))
    )
  );
