-- Firmen-interner Chat (unabhängig von einzelnen Projekten), Antwort auf
-- Julians Anforderung: Mitarbeiter von Handwerker-, Architekten- und
-- GU-Firmen sollen auch ihre eigene interne Struktur/Kommunikation in der
-- App sehen, nicht nur die projektbezogene Kommunikation. Bewusst getrennt
-- von "projekt_nachrichten" (0014_kommunikation.sql), das projektübergreifend
-- über mehrere Firmen hinweg läuft - hier geht es nur um die eigenen
-- Kolleg:innen, unabhängig davon, an welchen Projekten die Firma beteiligt
-- ist. Bewusst schlank gehalten (nur Text): Videotelefonie, Übersetzung und
-- KI-To-Dos bleiben vorerst dem projektbezogenen Chat vorbehalten.

create table firma_nachrichten (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references firmen(id) on delete cascade,
  autor_id uuid references profile(id),
  text text not null,
  erstellt_am timestamptz not null default now()
);

alter table firma_nachrichten enable row level security;

create policy "Firmenmitglieder sehen interne Nachrichten" on firma_nachrichten
  for select using (public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder schreiben interne Nachrichten" on firma_nachrichten
  for insert with check (public.is_member_of_firma(firma_id) and autor_id = auth.uid());
create policy "Autor loescht eigene interne Nachricht" on firma_nachrichten
  for delete using (autor_id = auth.uid());

-- Realtime-Updates, analog zum projektbezogenen Chat.
alter publication supabase_realtime add table firma_nachrichten;
