-- Bewertung & Netzwerk, Teil 1 (Kern-Workflow Schritt 7, Konzept Abschnitt
-- 8.4): "Echte Referenzen statt externer Sterne-Bewertungen" - das neue
-- Firmenprofil (Tab "Mein Profil" im Netzwerk-Bereich) zeigt automatisch
-- alle abgeschlossenen Aufträge der eigenen Firma, inkl. des Namens der
-- auftraggebenden Firma, falls das ein anderes Unternehmen auf der
-- Plattform ist.
--
-- Dafür fehlte eine RLS-Lücke: "firmen" hatte bisher nur eine Select-Policy
-- für die eigene Firma (is_member_of_firma). Ein Subunternehmen konnte den
-- Namen der auftraggebenden Firma (z.B. bei einem Angebot/Auftrag) damit
-- nicht sehen, selbst wenn beide am selben Projekt beteiligt sind - der
-- Join lieferte still null statt des Namens. Diese Policy ergänzt das
-- symmetrisch: sichtbar ist der Name einer Firma, wenn sie an einem
-- gemeinsamen Projekt beteiligt ist (als Projekteigentümerin oder als
-- Projektmitglied), unabhängig von der Richtung.
create policy "Projektbeteiligte sehen verknüpfte Firmen" on firmen
  for select using (
    exists (
      select 1 from projekte p
      where p.firma_id = firmen.id and public.is_member_of_projekt(p.id)
    )
    or exists (
      select 1 from projekt_mitglieder pm
      where pm.firma_id = firmen.id and public.is_member_of_projekt(pm.projekt_id)
    )
  );
