# Werkfluss – App

Dies ist der Übergang vom interaktiven Prototyp (`design/app.html`) zur echten,
mehrbenutzerfähigen Plattform. Hintergrund und Architekturentscheidungen stehen im
Projekt-Wissen (Konzept- und Architekturdokument).

## Struktur

- `apps/web` – Frontend (React + TypeScript + Vite), spricht direkt mit Supabase
  (Postgres + Auth + Realtime + Storage), Row-Level-Security erzwingt die Mandantentrennung.
- `supabase/migrations` – Datenbankschema als versionierte SQL-Migrationen.
- `docs` – ergänzende technische Notizen zu diesem Code (nicht das Gesamtkonzept).

## Erste Schritte (auf deinem eigenen Rechner, im normalen Terminal)

1. Node.js 20+ installiert? `node -v` prüfen.
2. Ins Frontend wechseln: `cd apps/web`
3. Pakete installieren: `npm install`
4. `.env.local` aus `.env.example` kopieren und mit deinen Supabase-Projektdaten befüllen
   (Projekt-URL + anon key, zu finden in Supabase unter Project Settings → API).
5. Datenbankschema in dein Supabase-Projekt einspielen: Inhalt von
   `supabase/migrations/0001_init.sql` im Supabase-Dashboard unter "SQL Editor" ausführen.
6. Entwicklungsserver starten: `npm run dev`

## Phase 1 (aktueller Stand)

Kern-Workflow laut Architekturkonzept: Login mit echter Mandantentrennung, Firma/Team,
Projektanlage, Bautagebuch, Mängel, Aufgaben, Angebote/Aufträge, Ausgangsrechnungen.
Weitere Module (Buchhaltung/Banking, CAD/BIM, Zeitmanagement-Gantt, ...) folgen laut
Phasen-Roadmap im Hauptkonzept, Abschnitt 16.
