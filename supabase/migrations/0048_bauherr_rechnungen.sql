-- Rechnungen und Zahlungsstatus für den Bauherrn sichtbar (Konzept Abschnitt
-- 8.6/9): die digitale Projektmappe soll dem Bauherrn u.a. "Rechnungen und
-- Zahlungsstatus" zeigen, als Teil des Transparenz-Grundsatzes ("Transparenz
-- ... ohne nachfragen zu müssen"). Rechnungen.tsx/Finanzen.tsx gibt es
-- längst, aber ausschließlich für die Finanzrolle der ausführenden Firma
-- (hat_finanz_zugriff, 0022) - der Bauherr selbst hatte bisher keinerlei
-- Einblick in seine eigenen Rechnungen innerhalb der App.
--
-- Bewusst nur eine zusätzliche, rein lesende RLS-Policy (Select-Policies
-- verhalten sich additiv/permissiv - die bestehende Finanzrollen-Policy
-- bleibt unverändert bestehen). Keine eigene Schreibrechte für den
-- Bauherrn: Rechnungen bleiben ausschließlich Sache der ausführenden Firma.
--
-- Eigene Hilfsfunktion statt is_member_of_projekt(), weil letztere auch
-- alle beteiligten Gewerke/Subunternehmer-Firmen als Projektmitglieder
-- einschließt - die sollen die Ausgangsrechnungen an den Bauherrn nicht
-- automatisch mitlesen können, nur der Bauherr selbst.

create function public.ist_bauherr_von_projekt(check_projekt_id uuid)
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

create policy "Bauherr sieht eigene Rechnungen" on rechnungen_ausgang
  for select using (public.ist_bauherr_von_projekt(projekt_id));
