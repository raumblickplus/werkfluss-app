-- Nachtragsmanagement (Konzept Abschnitt 8.1/6/16 Phase 1: "Nachtragsmanagement
-- (Änderungen dokumentieren, bepreisen, freigeben)") - bisher komplett
-- unumgesetzt, obwohl explizit als Kern-Workflow-Bestandteil genannt
-- ("Störungen & Abweichungen ... Nachträge werden im selben System
-- behandelt statt in Telefonaten/WhatsApp zu versickern").
--
-- Ein Nachtrag ändert die vereinbarte Summe eines bestehenden Auftrags
-- (Mehr- oder Minderleistung) - deshalb an auftraege gehängt, nicht an
-- Angebote/Projekte direkt. Einreichen kann sowohl die ausführende Firma
-- (z.B. "Mehraufwand durch unvorhergesehenen Bauschaden") als auch der
-- Eigentümer/GU selbst (z.B. "zusätzliche Leistung beauftragt"). Über
-- Freigabe/Ablehnung entscheidet ausschließlich der Eigentümer - und zwar
-- über eine eigene Funktion statt direktem Tabellen-Update, weil die
-- Freigabe zwei Dinge gleichzeitig auslöst: den Status wechseln UND die
-- auftraege.summe_netto_cents entsprechend anpassen. Nutzt dieselbe
-- Freigabekompetenz-Prüfung wie die Auftragserteilung (0029), da eine
-- Nachtragsfreigabe genau wie ein neuer Auftrag eine zusätzliche
-- Zahlungsverpflichtung der Firma begründet.

create table nachtraege (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  auftrag_id uuid not null references auftraege(id) on delete cascade,
  titel text not null,
  beschreibung text,
  betrag_netto_cents bigint not null,
  status text not null default 'eingereicht' check (status in ('eingereicht', 'freigegeben', 'abgelehnt')),
  eingereicht_von uuid references profile(id),
  entschieden_von uuid references profile(id),
  entschieden_am timestamptz,
  erstellt_am timestamptz not null default now()
);

alter table nachtraege enable row level security;

create policy "Beteiligte sehen Nachträge" on nachtraege
  for select using (
    public.is_owner_of_projekt(projekt_id)
    or exists (
      select 1 from auftraege a
      where a.id = nachtraege.auftrag_id and public.is_member_of_firma(a.auftragnehmer_firma_id)
    )
  );

create policy "Beteiligte reichen Nachträge ein" on nachtraege
  for insert with check (
    status = 'eingereicht'
    and (
      public.is_owner_of_projekt(projekt_id)
      or exists (
        select 1 from auftraege a
        where a.id = auftrag_id and public.is_member_of_firma(a.auftragnehmer_firma_id)
      )
    )
  );

-- Direkte Status-Updates bleiben bewusst dem Eigentümer für's Zurückziehen
-- eines noch offenen, eigenen Nachtrags vorbehalten - die eigentliche
-- Freigabe/Ablehnung läuft über nachtrag_entscheiden() unten, damit die
-- Freigabekompetenz-Prüfung nicht umgangen werden kann.
create policy "Eigentümer verwaltet offene Nachträge" on nachtraege
  for delete using (public.is_owner_of_projekt(projekt_id) and status = 'eingereicht');

create function public.nachtrag_entscheiden(p_nachtrag_id uuid, p_freigeben boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n_projekt_id uuid;
  n_auftrag_id uuid;
  n_betrag_cents bigint;
  n_status text;
begin
  select projekt_id, auftrag_id, betrag_netto_cents, status
    into n_projekt_id, n_auftrag_id, n_betrag_cents, n_status
  from nachtraege
  where id = p_nachtrag_id
  for update;

  if n_projekt_id is null then
    raise exception 'Nachtrag nicht gefunden';
  end if;
  if not public.is_owner_of_projekt(n_projekt_id) then
    raise exception 'Keine Berechtigung für diesen Nachtrag';
  end if;
  if n_status <> 'eingereicht' then
    raise exception 'Dieser Nachtrag wurde bereits entschieden';
  end if;

  if p_freigeben then
    -- Nur Mehrkosten (positiver Betrag) brauchen eine Freigabekompetenz-
    -- Prüfung - eine Minderleistung (negativer/0-Betrag) reduziert die
    -- Zahlungsverpflichtung und ist unkritisch.
    if n_betrag_cents > 0 and not public.hat_freigabe_fuer(n_projekt_id, n_betrag_cents) then
      raise exception 'Dein Freigabelimit reicht für diesen Nachtrag nicht aus';
    end if;

    update auftraege set summe_netto_cents = summe_netto_cents + n_betrag_cents where id = n_auftrag_id;
    update nachtraege set status = 'freigegeben', entschieden_von = auth.uid(), entschieden_am = now() where id = p_nachtrag_id;
  else
    update nachtraege set status = 'abgelehnt', entschieden_von = auth.uid(), entschieden_am = now() where id = p_nachtrag_id;
  end if;
end;
$$;

grant execute on function public.nachtrag_entscheiden(uuid, boolean) to authenticated;
