-- Mahnwesen für Ausgangsrechnungen (Konzept Abschnitt 8.12: "Mahnwesen ist
-- funktional Teil von 8.7") - bisher nur als Platzhalter-Kachel in der
-- Buchhaltung ("Automatische Zahlungserinnerungen und Mahnstufen ...")
-- angekündigt, komplett unumgesetzt.
--
-- Bewusst getrennt vom noch fehlenden Bankanbindungs-Feature: eine
-- automatische Zahlungserkennung braucht einen Kontoaggregations-Partner
-- (siehe Konzept, offen), aber Mahnstufen-Tracking und Mahnschreiben
-- brauchen das nicht - die Fälligkeit steht bereits in faellig_am, "offen"
-- vs. "bezahlt" wird schon manuell gepflegt. Deshalb hier nur ein
-- Stufen-Zähler + Zeitstempel je Rechnung, kein eigener Automatismus, der
-- Zahlungseingänge erkennen müsste.
--
-- Es gibt bewusst keine Mail-Versand-Automatik (wie bei den Team-Einladungen,
-- siehe 0030): Werkfluss erzeugt einen fertigen Mahntext zum Kopieren, der
-- Versand (E-Mail/Post) bleibt beim Nutzer, bis eine echte Mail-Infrastruktur
-- ansteht.

alter table rechnungen_ausgang
  add column mahnstufe smallint not null default 0 check (mahnstufe between 0 and 3),
  add column mahnstufe_gesetzt_am date;
