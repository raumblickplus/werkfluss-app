-- Aufmaß-/Leistungsstand-basierte Abschlagsrechnungen (Konzept Abschnitt
-- 8.2: "Umwandlung Angebot -> Auftrag -> Abschlagsrechnung ->
-- Schlussrechnung, automatisch aus dokumentiertem Baufortschritt
-- vorgeschlagen"). Rechnungen.tsx erlaubt bisher nur eine frei eingetippte
-- Summe je Rechnung, komplett losgeloest vom Leistungsverzeichnis/Angebot
-- des zugehoerigen Auftrags - dabei fuehren angebot_positionen (0017)
-- laengst Menge, Einheit und Einzelpreis je Position. Nach § 632a BGB/VOB/B
-- soll eine Abschlagsrechnung den nachgewiesenen Wert der tatsaechlich
-- erbrachten Leistung widerspiegeln, nicht eine frei gegriffene Zahl.
--
-- Append-only Protokoll wie bei fall_ereignisse/terminverschiebungen: pro
-- Eintrag wird die insgesamt bis dahin erbrachte Menge einer Position
-- gemeldet (kein Delta), der jeweils aktuelle Stand ist einfach der
-- juengste Eintrag je Position. Erfassen darf die ausfuehrende Firma des
-- Auftrags (die kennt den eigenen Baufortschritt) oder der
-- Projekteigentuemer. Die eigentliche Rechnung bleibt ein bewusster,
-- von einem Menschen bestaetigter Schritt (Frontend berechnet nur einen
-- Vorschlag) - keine automatische Rechnungserstellung oder Zahlungs-
-- freigabe, und keine Pruefung/Freigabe des gemeldeten Aufmaßes durch den
-- Auftraggeber (das waere ein eigener Workflow-Baustein).

create table leistungsstand_eintraege (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  angebot_position_id uuid not null references angebot_positionen(id) on delete cascade,
  erbrachte_menge numeric not null check (erbrachte_menge >= 0),
  notiz text,
  erstellt_von uuid references profile(id),
  erstellt_am timestamptz not null default now()
);

alter table leistungsstand_eintraege enable row level security;

create policy "Projektbeteiligte sehen Leistungsstand" on leistungsstand_eintraege
  for select using (public.is_member_of_projekt(projekt_id));

create policy "Auftragnehmer und Eigentuemer erfassen Leistungsstand" on leistungsstand_eintraege
  for insert with check (
    public.is_owner_of_projekt(projekt_id)
    or exists (
      select 1 from angebot_positionen ap
      join auftraege a on a.angebot_id = ap.angebot_id
      where ap.id = leistungsstand_eintraege.angebot_position_id
        and public.is_member_of_firma(a.auftragnehmer_firma_id)
    )
  );
