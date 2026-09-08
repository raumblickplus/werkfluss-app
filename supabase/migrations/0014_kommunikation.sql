-- Projektbezogener Chat (Kern-Workflow-Baustein "Kommunikation"): Nachrichten
-- bleiben dauerhaft und durchsuchbar statt in WhatsApp zu verschwinden.
-- Die Videotelefonie (siehe Kommunikation.tsx) läuft direkt zwischen den
-- Browsern (WebRTC) und braucht dafür keine eigene Tabelle, nur den
-- Realtime-Broadcast-Kanal von Supabase als "Vermittlung" für Angebot/
-- Antwort/ICE-Kandidaten.
--
-- Live-Uebersetzung und automatische KI-To-Do-Erstellung aus dem Konzept
-- brauchen einen externen Uebersetzungs-/KI-Dienst mit eigenem API-Key und
-- sind bewusst nicht Teil dieser ersten Version.

create table projekt_nachrichten (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  autor_id uuid references profile(id),
  text text not null,
  erstellt_am timestamptz not null default now()
);

alter table projekt_nachrichten enable row level security;

create policy "Projektbeteiligte sehen Nachrichten" on projekt_nachrichten
  for select using (public.is_member_of_projekt(projekt_id));
create policy "Projektbeteiligte schreiben Nachrichten" on projekt_nachrichten
  for insert with check (public.is_member_of_projekt(projekt_id) and autor_id = auth.uid());
create policy "Autor loescht eigene Nachricht" on projekt_nachrichten
  for delete using (autor_id = auth.uid());

-- Realtime-Updates fuer den Chat (neue Nachrichten live ohne Neuladen).
alter publication supabase_realtime add table projekt_nachrichten;
