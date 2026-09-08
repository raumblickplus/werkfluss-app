-- Erlaubt jeder Firma, zusaetzlich zur festen VOB/C-Liste (0004) eigene,
-- firmenspezifische Gewerke anzulegen (z. B. Spezialgewerke, die in der
-- Standardliste fehlen). Globale Gewerke (firma_id ist null) bleiben fuer
-- alle sichtbar und unveraendert von Firmen bearbeitbar; eigene Gewerke
-- sind nur fuer die anlegende Firma sichtbar und nur von ihr verwaltbar.

alter table gewerke add column if not exists firma_id uuid references firmen(id) on delete cascade;

-- Name muss nur innerhalb einer Firma (bzw. innerhalb der globalen Liste)
-- eindeutig sein, nicht mehr firmenuebergreifend.
alter table gewerke drop constraint if exists gewerke_name_key;
alter table gewerke add constraint gewerke_firma_name_key unique (firma_id, name);

drop policy if exists "Angemeldete sehen Gewerke" on gewerke;

create policy "Alle sehen globale Gewerke" on gewerke
  for select using (firma_id is null);
create policy "Firmenmitglieder sehen eigene Gewerke" on gewerke
  for select using (firma_id is not null and public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder legen eigene Gewerke an" on gewerke
  for insert with check (firma_id is not null and public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder aendern eigene Gewerke" on gewerke
  for update using (firma_id is not null and public.is_member_of_firma(firma_id))
  with check (firma_id is not null and public.is_member_of_firma(firma_id));
create policy "Firmenmitglieder loeschen eigene Gewerke" on gewerke
  for delete using (firma_id is not null and public.is_member_of_firma(firma_id));
