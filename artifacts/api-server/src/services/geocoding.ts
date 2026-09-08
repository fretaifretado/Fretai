const geoCache = new Map<string, { lat: number; lng: number }>();

type ViaCepAddress = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

type BrasilApiCep = {
  location?: {
    coordinates?: {
      latitude?: string;
      longitude?: string;
    };
  };
};

function addressCandidates(address: string): string[] {
  const cleaned = address.trim().replace(/\s+/g, " ");
  const normalized = cleaned
    .replace(/\s+-\s+/g, ", ")
    .replace(/\bAv\.?\s+/gi, "Avenida ")
    .replace(/\bDr\.?\s+/gi, "Doutor ")
    .replace(/\bR\.?\s+/gi, "Rua ")
    .replace(/,\s*,+/g, ", ");
  const withoutHouseNumber = normalized
    .replace(/,\s*(?:s\/?n|n[ºo°]?\s*)?\d+[\w./-]*\s*,/i, ", ")
    .replace(/,\s*,+/g, ", ");

  return [...new Set([cleaned, normalized, withoutHouseNumber])].filter(Boolean);
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

function postalCodeFromAddress(address: string): string | null {
  return address.match(/\b\d{5}-?\d{3}\b/)?.[0]?.replace(/\D/g, "") ?? null;
}

async function structuredAddressFromCep(address: string): Promise<ViaCepAddress | null> {
  const postalCode = postalCodeFromAddress(address);
  if (!postalCode) return null;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
      headers: { "User-Agent": "FretaiApp/1.0 (geocoding; contato@fretai.com.br)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const result = await response.json() as ViaCepAddress;
    if (result.erro || !result.logradouro || !result.localidade || !result.uf) return null;
    return result;
  } catch {
    return null;
  }
}

async function coordinatesFromCep(address: string): Promise<{ lat: number; lng: number } | null> {
  const postalCode = postalCodeFromAddress(address);
  if (!postalCode) return null;

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${postalCode}`, {
      headers: { "User-Agent": "FretaiApp/1.0 (geocoding; contato@fretai.com.br)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const result = await response.json() as BrasilApiCep;
    const lat = Number.parseFloat(result.location?.coordinates?.latitude ?? "");
    const lng = Number.parseFloat(result.location?.coordinates?.longitude ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function nominatimUrl(query: string | ViaCepAddress): string {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "br",
    "accept-language": "pt-BR",
  });
  if (typeof query === "string") {
    params.set("q", query);
  } else {
    params.set("street", query.logradouro!);
    params.set("city", query.localidade!);
    params.set("state", query.uf!);
    if (query.cep) params.set("postalcode", query.cep);
    params.set("country", "Brasil");
  }
  return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

export async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  const key = address.trim().toLowerCase();
  const cached = geoCache.get(key);
  if (cached) return cached;

  const textualCandidates = addressCandidates(address);
  const [structuredCandidate, cepCoordinates] = await Promise.all([
    structuredAddressFromCep(address),
    coordinatesFromCep(address),
  ]);
  const candidates: Array<string | ViaCepAddress> = structuredCandidate
    ? [structuredCandidate]
    : textualCandidates;
  for (let index = 0; index < candidates.length; index++) {
    if (index > 0) await wait(1_100);
    try {
      const candidate = candidates[index]!;
      const response = await fetch(nominatimUrl(candidate), {
        headers: { "User-Agent": "FretaiApp/1.0 (geocoding; contato@fretai.com.br)" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) continue;

      const data = await response.json() as Array<{ lat: string; lon: string }>;
      const first = data[0];
      if (!first) continue;

      const lat = Number.parseFloat(first.lat);
      const lng = Number.parseFloat(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const result = { lat, lng };
      geoCache.set(key, result);
      return result;
    } catch {
      // Tenta a próxima versão do endereço.
    }
  }
  if (cepCoordinates) {
    geoCache.set(key, cepCoordinates);
    return cepCoordinates;
  }
  return null;
}
