-- Gewährleistungsfristen (ergänzt Abnahme, 0015): Konzept Abschnitt 9
-- ("Pflichtdokumentation") betont belastbare Nachweise im Streitfall,
-- aber die Frist selbst, ab der Mängelansprüche verjähren, wurde bisher
-- nirgends festgehalten - nach der Abnahme war das Thema für die App
-- erledigt, obwohl die eigentliche Verantwortung (5 Jahre BGB-Regelfall
-- bei Bauwerken, häufig 4 Jahre bei VOB/B-Vereinbarung) gerade erst
-- beginnt.
--
-- Bewusst nur ein Jahres-Wert statt eines festen Enums: die tatsächlich
-- vereinbarte Frist hängt vom Vertrag ab (BGB/VOB/B, individuell verkürzt
-- oder verlängert) - das Enddatum wird im Frontend aus Abnahmedatum +
-- Jahren berechnet, keine Rechtsberatung, welche Frist im Einzelfall gilt.

alter table abnahmen add column gewaehrleistungsfrist_jahre integer not null default 5;
