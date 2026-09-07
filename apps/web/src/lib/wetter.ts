// Wetter automatisch anhand des Projektstandorts – nutzt Open-Meteo
// (kostenlos, ohne API-Key, siehe open-meteo.com). Läuft im Browser des
// Nutzers, nicht auf unserem Server – daher kein Backend-Baustein nötig.

export type Koordinaten = { breitengrad: number; laengengrad: number }

const wmoBeschreibung: Record<number, string> = {
  0: 'Klarer Himmel',
  1: 'Überwiegend klar',
  2: 'Teilweise bewölkt',
  3: 'Bedeckt',
  45: 'Nebel',
  48: 'Reifnebel',
  51: 'Leichter Nieselregen',
  53: 'Mäßiger Nieselregen',
  55: 'Starker Nieselregen',
  56: 'Leichter gefrierender Nieselregen',
  57: 'Starker gefrierender Nieselregen',
  61: 'Leichter Regen',
  63: 'Mäßiger Regen',
  65: 'Starker Regen',
  66: 'Leichter gefrierender Regen',
  67: 'Starker gefrierender Regen',
  71: 'Leichter Schneefall',
  73: 'Mäßiger Schneefall',
  75: 'Starker Schneefall',
  77: 'Schneegriesel',
  80: 'Leichte Regenschauer',
  81: 'Mäßige Regenschauer',
  82: 'Heftige Regenschauer',
  85: 'Leichte Schneeschauer',
  86: 'Starke Schneeschauer',
  95: 'Gewitter',
  96: 'Gewitter mit leichtem Hagel',
  99: 'Gewitter mit starkem Hagel',
}

export async function adresseZuKoordinaten(adresse: string): Promise<Koordinaten | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(adresse)}&count=1&language=de&format=json`
    const res = await fetch(url)
    if (!res.ok) return null
    const daten = await res.json()
    const treffer = daten?.results?.[0]
    if (!treffer) return null
    return { breitengrad: treffer.latitude, laengengrad: treffer.longitude }
  } catch {
    return null
  }
}

export async function aktuellesWetter(
  koordinaten: Koordinaten
): Promise<{ beschreibung: string; temperatur: number } | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${koordinaten.breitengrad}&longitude=${koordinaten.laengengrad}&current=temperature_2m,weather_code&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) return null
    const daten = await res.json()
    const code = daten?.current?.weather_code
    const temperatur = daten?.current?.temperature_2m
    if (temperatur === undefined) return null
    return { beschreibung: wmoBeschreibung[code] ?? 'Unbekannt', temperatur }
  } catch {
    return null
  }
}
