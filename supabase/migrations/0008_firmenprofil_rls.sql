-- Zwei RLS-Lücken, die beim Bau der Team-Seite (Migration 0007) auffielen:
--
-- 1. "profile" hatte bisher nur eine Select-Policy für die eigene Zeile
--    (id = auth.uid()). Das reicht, solange man alleine in der Firma ist,
--    bricht aber sobald ein zweites Mitglied da ist: jeder Join auf
--    profile (z.B. in Team.tsx: firma_mitglieder -> profile(vollname,
--    email)) liefert für Kolleg:innen dann null statt Name/E-Mail, weil
--    RLS den Join genauso filtert wie eine direkte Abfrage.
--    Lösung: Kolleg:innen derselben Firma dürfen sich gegenseitig sehen.
--
-- 2. "firmen" hatte überhaupt keine Update-Policy – ein Tippfehler beim
--    Anlegen der Firma (Name, Adresse, USt-ID) ließ sich technisch nicht
--    korrigieren. Lösung: Firmen-Admins (inhaber/geschaeftsfuehrung)
--    dürfen die eigene Firma bearbeiten.

create policy "Kolleg:innen sehen sich gegenseitig" on profile
  for select using (
    exists (
      select 1 from firma_mitglieder mein
      join firma_mitglieder deren on deren.firma_id = mein.firma_id
      where mein.nutzer_id = auth.uid() and deren.nutzer_id = profile.id
    )
  );

create policy "Admins bearbeiten ihre Firma" on firmen
  for update using (public.is_admin_of_firma(id)) with check (public.is_admin_of_firma(id));
