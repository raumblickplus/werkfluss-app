-- Gewerke-Referenzdaten + Standard-Checklisten je Gewerk, dazu strukturierte
-- Bautagebuch-Erweiterung: für welches Gewerk gilt der Eintrag, wer war
-- anwesend (Beteiligte + Kunde), welche Standardaufgaben wurden erledigt.
-- Quelle Gewerke-Liste: VOB/C-Systematik (ATV/DIN 18299 ff.), praxisüblich
-- ergänzt. Aufgaben sind editierbare Startvorschläge, keine Norm.

create table gewerke (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sortierung int not null
);

create table gewerk_standardaufgaben (
  id uuid primary key default gen_random_uuid(),
  gewerk_id uuid not null references gewerke(id) on delete cascade,
  titel text not null,
  sortierung int not null,
  unique (gewerk_id, titel)
);

alter table gewerke enable row level security;
alter table gewerk_standardaufgaben enable row level security;
create policy "Angemeldete sehen Gewerke" on gewerke for select using (auth.role() = 'authenticated');
create policy "Angemeldete sehen Standardaufgaben" on gewerk_standardaufgaben for select using (auth.role() = 'authenticated');

insert into gewerke (name, sortierung) values
  ('Abbruch-/Rückbauarbeiten', 1),
  ('Erdarbeiten', 2),
  ('Gerüstbau', 3),
  ('Rohbau-/Maurerarbeiten', 4),
  ('Beton-/Stahlbetonarbeiten', 5),
  ('Zimmerer-/Holzbauarbeiten', 6),
  ('Dachdeckerarbeiten', 7),
  ('Klempner-/Spenglerarbeiten', 8),
  ('Abdichtungsarbeiten', 9),
  ('Fenster-/Türenbau', 10),
  ('Trockenbau', 11),
  ('Elektroinstallation', 12),
  ('Sanitärinstallation', 13),
  ('Heizungs-/Lüftungsbau', 14),
  ('Putz-/Stuckarbeiten', 15),
  ('Estricharbeiten', 16),
  ('Fliesen-/Plattenarbeiten', 17),
  ('Maler-/Lackierarbeiten', 18),
  ('Bodenbelagsarbeiten', 19),
  ('Tischler-/Schreinerarbeiten', 20),
  ('Metallbau-/Schlosserarbeiten', 21),
  ('Garten-/Landschaftsbau', 22);

insert into gewerk_standardaufgaben (gewerk_id, titel, sortierung)
select g.id, x.titel, x.sortierung from gewerke g join (values
  ('Abbruch-/Rückbauarbeiten', 'Schadstoffe erkundet', 1),
  ('Abbruch-/Rückbauarbeiten', 'Bauzaun/Absperrung aufgestellt', 2),
  ('Abbruch-/Rückbauarbeiten', 'Entkernung durchgeführt', 3),
  ('Abbruch-/Rückbauarbeiten', 'Tragende Bauteile abgebrochen', 4),
  ('Abbruch-/Rückbauarbeiten', 'Bauschutt getrennt/entsorgt', 5),
  ('Abbruch-/Rückbauarbeiten', 'Fundamentreste entfernt', 6),
  ('Erdarbeiten', 'Baustelle eingerichtet', 1),
  ('Erdarbeiten', 'Baugrube ausgehoben', 2),
  ('Erdarbeiten', 'Bodentragfähigkeit geprüft', 3),
  ('Erdarbeiten', 'Leitungsgräben ausgehoben', 4),
  ('Erdarbeiten', 'Verbau/Böschung gesichert', 5),
  ('Erdarbeiten', 'Baugrube verfüllt/verdichtet', 6),
  ('Gerüstbau', 'Gerüst aufgestellt', 1),
  ('Gerüstbau', 'Standsicherheit geprüft', 2),
  ('Gerüstbau', 'Prüfprotokoll/Freigabe erteilt', 3),
  ('Gerüstbau', 'Gerüst erweitert/umgesetzt', 4),
  ('Gerüstbau', 'Geländer/Fanggerüst montiert', 5),
  ('Gerüstbau', 'Gerüst abgebaut', 6),
  ('Rohbau-/Maurerarbeiten', 'Fundament gemauert', 1),
  ('Rohbau-/Maurerarbeiten', 'Kellerwände gemauert', 2),
  ('Rohbau-/Maurerarbeiten', 'Tragende Wände hochgezogen', 3),
  ('Rohbau-/Maurerarbeiten', 'Ringanker/Stürze eingebaut', 4),
  ('Rohbau-/Maurerarbeiten', 'Maßtoleranzen geprüft', 5),
  ('Rohbau-/Maurerarbeiten', 'Mauerwerk verfugt', 6),
  ('Beton-/Stahlbetonarbeiten', 'Schalung gestellt', 1),
  ('Beton-/Stahlbetonarbeiten', 'Bewehrung verlegt', 2),
  ('Beton-/Stahlbetonarbeiten', 'Beton eingebracht/verdichtet', 3),
  ('Beton-/Stahlbetonarbeiten', 'Nachbehandlung durchgeführt', 4),
  ('Beton-/Stahlbetonarbeiten', 'Schalung entfernt', 5),
  ('Beton-/Stahlbetonarbeiten', 'Betonoberfläche nachbearbeitet', 6),
  ('Zimmerer-/Holzbauarbeiten', 'Dachstuhl aufgerichtet', 1),
  ('Zimmerer-/Holzbauarbeiten', 'Sparren/Holzkonstruktion montiert', 2),
  ('Zimmerer-/Holzbauarbeiten', 'Deckenbalken verlegt', 3),
  ('Zimmerer-/Holzbauarbeiten', 'Holzschutz aufgebracht', 4),
  ('Zimmerer-/Holzbauarbeiten', 'Beschläge/Anschlüsse montiert', 5),
  ('Zimmerer-/Holzbauarbeiten', 'Richtfest durchgeführt', 6),
  ('Dachdeckerarbeiten', 'Dachlattung montiert', 1),
  ('Dachdeckerarbeiten', 'Unterspannbahn verlegt', 2),
  ('Dachdeckerarbeiten', 'Dacheindeckung verlegt', 3),
  ('Dachdeckerarbeiten', 'Dachfenster eingebaut', 4),
  ('Dachdeckerarbeiten', 'First-/Gratabdeckung montiert', 5),
  ('Dachdeckerarbeiten', 'Dachrinnen montiert', 6),
  ('Klempner-/Spenglerarbeiten', 'Regenrinnen montiert', 1),
  ('Klempner-/Spenglerarbeiten', 'Fallrohre montiert', 2),
  ('Klempner-/Spenglerarbeiten', 'Blechanschlüsse/Ortgang verkleidet', 3),
  ('Klempner-/Spenglerarbeiten', 'Dachdurchdringungen abgedichtet', 4),
  ('Klempner-/Spenglerarbeiten', 'Attika/Fensterbänke verblecht', 5),
  ('Klempner-/Spenglerarbeiten', 'Dichtheit geprüft', 6),
  ('Abdichtungsarbeiten', 'Bauwerksabdichtung Keller aufgebracht', 1),
  ('Abdichtungsarbeiten', 'Fugen abgedichtet', 2),
  ('Abdichtungsarbeiten', 'Feuchtigkeitssperre eingebaut', 3),
  ('Abdichtungsarbeiten', 'Drainage verlegt', 4),
  ('Abdichtungsarbeiten', 'Abdichtung Nassräume ausgeführt', 5),
  ('Abdichtungsarbeiten', 'Dichtheitsprüfung durchgeführt', 6),
  ('Fenster-/Türenbau', 'Fenster eingemessen', 1),
  ('Fenster-/Türenbau', 'Fenster/Türen eingebaut', 2),
  ('Fenster-/Türenbau', 'Ausgeschäumt/abgedichtet', 3),
  ('Fenster-/Türenbau', 'Fensterbänke montiert', 4),
  ('Fenster-/Türenbau', 'Beschläge justiert', 5),
  ('Fenster-/Türenbau', 'Funktionsprüfung durchgeführt', 6),
  ('Trockenbau', 'Metallständerwerk montiert', 1),
  ('Trockenbau', 'Dämmung eingebracht', 2),
  ('Trockenbau', 'Beplankung montiert', 3),
  ('Trockenbau', 'Deckenabhängung eingebaut', 4),
  ('Trockenbau', 'Fugen verspachtelt', 5),
  ('Trockenbau', 'Revisionsöffnungen eingebaut', 6),
  ('Elektroinstallation', 'Leerrohre verlegt', 1),
  ('Elektroinstallation', 'Kabel gezogen', 2),
  ('Elektroinstallation', 'Unterputzdosen gesetzt', 3),
  ('Elektroinstallation', 'Verteilerschrank angeschlossen', 4),
  ('Elektroinstallation', 'Steckdosen/Schalter montiert', 5),
  ('Elektroinstallation', 'Funktionsprüfung durchgeführt', 6),
  ('Sanitärinstallation', 'Rohrleitungen verlegt', 1),
  ('Sanitärinstallation', 'Anschlüsse für Sanitärobjekte gesetzt', 2),
  ('Sanitärinstallation', 'Sanitärobjekte montiert', 3),
  ('Sanitärinstallation', 'Armaturen eingebaut', 4),
  ('Sanitärinstallation', 'Dichtheitsprüfung durchgeführt', 5),
  ('Sanitärinstallation', 'Entwässerung angeschlossen', 6),
  ('Heizungs-/Lüftungsbau', 'Heizungsrohre verlegt', 1),
  ('Heizungs-/Lüftungsbau', 'Heizkörper/Fußbodenheizung montiert', 2),
  ('Heizungs-/Lüftungsbau', 'Wärmeerzeuger installiert', 3),
  ('Heizungs-/Lüftungsbau', 'Lüftungskanäle verlegt', 4),
  ('Heizungs-/Lüftungsbau', 'Anlage befüllt/gespült', 5),
  ('Heizungs-/Lüftungsbau', 'Inbetriebnahme/Einregulierung durchgeführt', 6),
  ('Putz-/Stuckarbeiten', 'Untergrund vorbereitet', 1),
  ('Putz-/Stuckarbeiten', 'Putzträger/Eckschienen montiert', 2),
  ('Putz-/Stuckarbeiten', 'Grundputz aufgebracht', 3),
  ('Putz-/Stuckarbeiten', 'Oberputz/Feinputz aufgetragen', 4),
  ('Putz-/Stuckarbeiten', 'Stuckelemente montiert', 5),
  ('Putz-/Stuckarbeiten', 'Trocknungszeit geprüft', 6),
  ('Estricharbeiten', 'Dämmschicht verlegt', 1),
  ('Estricharbeiten', 'Trittschalldämmung eingebaut', 2),
  ('Estricharbeiten', 'Estrich eingebracht', 3),
  ('Estricharbeiten', 'Randfugen gesetzt', 4),
  ('Estricharbeiten', 'Belegreife geprüft', 5),
  ('Estricharbeiten', 'Oberfläche geschliffen', 6),
  ('Fliesen-/Plattenarbeiten', 'Untergrund grundiert', 1),
  ('Fliesen-/Plattenarbeiten', 'Abdichtung Nassbereich aufgebracht', 2),
  ('Fliesen-/Plattenarbeiten', 'Fliesen verlegt', 3),
  ('Fliesen-/Plattenarbeiten', 'Fugen verfugt', 4),
  ('Fliesen-/Plattenarbeiten', 'Silikonfugen gezogen', 5),
  ('Fliesen-/Plattenarbeiten', 'Verlegequalität geprüft', 6),
  ('Maler-/Lackierarbeiten', 'Untergrund gespachtelt/geschliffen', 1),
  ('Maler-/Lackierarbeiten', 'Grundierung aufgetragen', 2),
  ('Maler-/Lackierarbeiten', 'Tapeten verlegt', 3),
  ('Maler-/Lackierarbeiten', 'Anstrich aufgetragen', 4),
  ('Maler-/Lackierarbeiten', 'Türen/Zargen lackiert', 5),
  ('Maler-/Lackierarbeiten', 'Endkontrolle durchgeführt', 6),
  ('Bodenbelagsarbeiten', 'Untergrund geprüft/vorbereitet', 1),
  ('Bodenbelagsarbeiten', 'Spachtelmasse aufgebracht', 2),
  ('Bodenbelagsarbeiten', 'Bodenbelag verlegt', 3),
  ('Bodenbelagsarbeiten', 'Sockelleisten montiert', 4),
  ('Bodenbelagsarbeiten', 'Übergangsprofile montiert', 5),
  ('Bodenbelagsarbeiten', 'Endreinigung durchgeführt', 6),
  ('Tischler-/Schreinerarbeiten', 'Innentüren eingebaut', 1),
  ('Tischler-/Schreinerarbeiten', 'Einbaumöbel montiert', 2),
  ('Tischler-/Schreinerarbeiten', 'Treppen montiert', 3),
  ('Tischler-/Schreinerarbeiten', 'Fensterbänke/Verkleidungen angepasst', 4),
  ('Tischler-/Schreinerarbeiten', 'Beschläge eingestellt', 5),
  ('Tischler-/Schreinerarbeiten', 'Maßgenauigkeit abgenommen', 6),
  ('Metallbau-/Schlosserarbeiten', 'Geländer montiert', 1),
  ('Metallbau-/Schlosserarbeiten', 'Stahltreppen montiert', 2),
  ('Metallbau-/Schlosserarbeiten', 'Stahlkonstruktionen/Träger eingebaut', 3),
  ('Metallbau-/Schlosserarbeiten', 'Tore/Zäune montiert', 4),
  ('Metallbau-/Schlosserarbeiten', 'Korrosionsschutz aufgebracht', 5),
  ('Metallbau-/Schlosserarbeiten', 'Schweißnähte geprüft', 6),
  ('Garten-/Landschaftsbau', 'Erdmodellierung durchgeführt', 1),
  ('Garten-/Landschaftsbau', 'Wege-/Pflasterflächen angelegt', 2),
  ('Garten-/Landschaftsbau', 'Pflanzflächen angelegt', 3),
  ('Garten-/Landschaftsbau', 'Rasen angesät/verlegt', 4),
  ('Garten-/Landschaftsbau', 'Zaun-/Sichtschutzelemente montiert', 5),
  ('Garten-/Landschaftsbau', 'Bewässerung/Drainage installiert', 6)
) as x(gewerk_name, titel, sortierung) on g.name = x.gewerk_name;

-- Bautagebuch: für welches Gewerk gilt der Eintrag, war der Kunde dabei
alter table bautagebuch_eintraege add column if not exists gewerk_id uuid references gewerke(id);
alter table bautagebuch_eintraege add column if not exists kunde_anwesend boolean not null default false;
alter table bautagebuch_eintraege alter column taetigkeiten drop not null;

-- Welche Beteiligten (aus projekt_beteiligte) waren bei diesem Eintrag dabei
create table bautagebuch_anwesende (
  id uuid primary key default gen_random_uuid(),
  bautagebuch_id uuid not null references bautagebuch_eintraege(id) on delete cascade,
  beteiligter_id uuid not null references projekt_beteiligte(id) on delete cascade,
  unique (bautagebuch_id, beteiligter_id)
);

-- Welche Standardaufgaben (oder frei ergänzte) wurden an diesem Tag erledigt
create table bautagebuch_aufgaben (
  id uuid primary key default gen_random_uuid(),
  bautagebuch_id uuid not null references bautagebuch_eintraege(id) on delete cascade,
  standardaufgabe_id uuid references gewerk_standardaufgaben(id),
  titel text not null,
  erledigt boolean not null default true
);

alter table bautagebuch_anwesende enable row level security;
alter table bautagebuch_aufgaben enable row level security;

create policy "Projektbeteiligte sehen Anwesenheit" on bautagebuch_anwesende
  for select using (
    exists (select 1 from bautagebuch_eintraege b where b.id = bautagebuch_anwesende.bautagebuch_id and public.is_member_of_projekt(b.projekt_id))
  );
create policy "Projektbeteiligte verwalten Anwesenheit" on bautagebuch_anwesende
  for all using (
    exists (select 1 from bautagebuch_eintraege b where b.id = bautagebuch_anwesende.bautagebuch_id and public.is_member_of_projekt(b.projekt_id))
  ) with check (
    exists (select 1 from bautagebuch_eintraege b where b.id = bautagebuch_anwesende.bautagebuch_id and public.is_member_of_projekt(b.projekt_id))
  );

create policy "Projektbeteiligte sehen erledigte Aufgaben" on bautagebuch_aufgaben
  for select using (
    exists (select 1 from bautagebuch_eintraege b where b.id = bautagebuch_aufgaben.bautagebuch_id and public.is_member_of_projekt(b.projekt_id))
  );
create policy "Projektbeteiligte verwalten erledigte Aufgaben" on bautagebuch_aufgaben
  for all using (
    exists (select 1 from bautagebuch_eintraege b where b.id = bautagebuch_aufgaben.bautagebuch_id and public.is_member_of_projekt(b.projekt_id))
  ) with check (
    exists (select 1 from bautagebuch_eintraege b where b.id = bautagebuch_aufgaben.bautagebuch_id and public.is_member_of_projekt(b.projekt_id))
  );
