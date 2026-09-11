-- Logo und Akzentfarbe der Firma für Rechnungen/Angebote/Mahnungen
-- (Julian-Feedback 12.09.2026: "das generelle Design ... muss gut
-- aussehen ... ebenfalls mit Logo der Firma"). Der PDF-Export (0051/
-- druckExport.ts) hatte bisher nur Textfelder im Briefkopf - kein Logo,
-- keine anpassbare Farbe.
--
-- logo_url zeigt auf den bereits bestehenden, öffentlichen "logos"-Bucket
-- (0009_netzwerk.sql, dort schon für Netzwerk-Kontakt-Logos genutzt) -
-- dieselbe Logik wird jetzt für das eigene Firmenlogo wiederverwendet,
-- kein neuer Bucket nötig. akzentfarbe ist die "Option" aus Julians
-- Wunsch nach einem "PDF-Generator mit Optionen anpassbar" für diese
-- erste Ausbaustufe: eine frei wählbare Akzentfarbe für Kopf-/Summenblock
-- auf den generierten Dokumenten, Default = die App-eigene Terrakotta-
-- Akzentfarbe (#C1552F, siehe index.css --orange).

alter table firmen
  add column if not exists logo_url text,
  add column if not exists akzentfarbe text not null default '#C1552F';
