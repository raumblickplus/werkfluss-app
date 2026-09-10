-- DATEV-Export für die Buchhaltung (Konzept Abschnitt 8.7/17): Firmen können
-- die Angaben hinterlegen, die ein Buchungsstapel-Export braucht (Berater-/
-- Mandantennummer von der Steuerkanzlei, Kontenrahmen, Erlös- und
-- Sammel-Debitorenkonto). Ohne eigenes Kontenmodell/echte Bankanbindung ist
-- das bewusst eine Vereinfachung: alle Ausgangsrechnungen laufen auf ein
-- konfigurierbares Sammel-Debitorenkonto, die Steuerkanzlei kann über
-- Belegfeld 1 (Rechnungsnummer) trotzdem eindeutig zuordnen.

alter table firmen
  add column if not exists datev_berater_nr text,
  add column if not exists datev_mandanten_nr text,
  add column if not exists datev_kontenrahmen text check (datev_kontenrahmen in ('SKR03', 'SKR04')),
  add column if not exists datev_erloeskonto text,
  add column if not exists datev_debitorenkonto text;
