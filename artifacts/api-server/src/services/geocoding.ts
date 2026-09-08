const geoCache = new Map<string, { lat: number; lng: number }>();

export async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  const key = address.trim().toLowerCase();
  const cached = geoCache.get(key);
  if (cached) return cached;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`;
    const response = await fetch(url, {
      headers: { "User-Agent": "FretaiApp/1.0 (geocoding)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const data = await response.json() as Array<{ lat: string; lon: string }>;
    const first = data[0];
    if (!first) return null;

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const result = { lat, lng };
    geoCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
