-- Ergänzt Koordinaten am Projekt, damit sich Wetterdaten automatisch anhand
-- des Projektstandorts abrufen lassen (Bautagebuch, siehe App-Code).
alter table projekte add column if not exists breitengrad numeric;
alter table projekte add column if not exists laengengrad numeric;
