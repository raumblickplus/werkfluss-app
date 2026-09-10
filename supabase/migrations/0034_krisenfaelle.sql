-- Krisenmanagement / Fall-Akte (Konzept Abschnitt 8.18) - bewusst nur der
-- Teil, der ohne externe Datenquellen und ohne Partnerintegration sofort
-- echten Wert bringt: eine strukturierte, zeitgestempelte Fall-Akte je
-- Eskalation (Terminverzug, Leistungsstörung, eskalierender Streit), deren
-- Stufenverlauf im Streit-/Gewährleistungsfall belastbar ist.
--
-- Bewusst NICHT umgesetzt (siehe Konzept 8.18 für den vollen Umfang, dort
-- jetzt auch als offen markiert): Insolvenzindiz-Erkennung (bräuchte
-- externe Handelsregister-/Netzwerk-Datenquellen), ein eingebundener
-- Mediator (bräuchte eine echte Partnerintegration), automatisierte
-- Vertragskündigung/Neuvergabe. Diese drei bleiben offen, damit hier keine
-- Rechtsauskunft oder automatisierte Vertragsfolge vorgetäuscht wird - der
-- Nutzer dokumentiert und entscheidet, Werkfluss führt nur die Fall-Akte.

create table faelle (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  auftrag_id uuid references auftraege(id) on delete set null,
  titel text not null,
  beschreibung text,
  gewerk text,
  status text not null default 'offen' check (status in ('offen', 'frist_gesetzt', 'mahnung_dokumentiert', 'streitschlichtung', 'vertrag_gekuendigt', 'beigelegt')),
  eroeffnet_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table faelle enable row level security;

-- Sichtbar für den Eigentümer (der Fälle eröffnet) und für die Firma, gegen
-- die sich ein Fall richtet (sofern ein Auftrag verknüpft ist) - dieselbe
-- Transparenz wie bei Nachträgen (0031), weil ein Fall genau wie ein
-- Nachtrag beide Seiten betrifft.
create policy "Beteiligte sehen Fälle" on faelle
  for select using (
    public.is_owner_of_projekt(projekt_id)
    or (auftrag_id is not null and exists (
      select 1 from auftraege a where a.id = faelle.auftrag_id and public.is_member_of_firma(a.auftragnehmer_firma_id)
    ))
  );

-- Eröffnen und Eskalieren bleibt bewusst dem Eigentümer vorbehalten: ein
-- Fall wird vom Auftraggeber gegen eine nicht/schlecht leistende Firma
-- geführt, nicht umgekehrt verhandelt.
create policy "Eigentümer eröffnet Fälle" on faelle
  for insert with check (public.is_owner_of_projekt(projekt_id));

create policy "Eigentümer aktualisiert Fälle" on faelle
  for update using (public.is_owner_of_projekt(projekt_id));

-- Append-only Verlauf: jede Stufenänderung/Notiz bleibt dauerhaft
-- nachvollziehbar dokumentiert, auch wenn sich faelle.status später
-- weiterändert - das ist der eigentliche Beweiswert der Fall-Akte.
create table fall_ereignisse (
  id uuid primary key default gen_random_uuid(),
  fall_id uuid not null references faelle(id) on delete cascade,
  typ text not null check (typ in ('eroeffnet', 'frist_gesetzt', 'mahnung_dokumentiert', 'streitschlichtung_angefragt', 'vertrag_gekuendigt', 'beigelegt', 'notiz')),
  beschreibung text,
  frist_bis date,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table fall_ereignisse enable row level security;

create policy "Beteiligte sehen Fall-Verlauf" on fall_ereignisse
  for select using (
    exists (
      select 1 from faelle f
      where f.id = fall_ereignisse.fall_id
        and (
          public.is_owner_of_projekt(f.projekt_id)
          or (f.auftrag_id is not null and exists (
            select 1 from auftraege a where a.id = f.auftrag_id and public.is_member_of_firma(a.auftragnehmer_firma_id)
          ))
        )
    )
  );

create policy "Eigentümer dokumentiert Fall-Ereignisse" on fall_ereignisse
  for insert with check (
    exists (select 1 from faelle f where f.id = fall_id and public.is_owner_of_projekt(f.projekt_id))
  );
