export type ViaCepResult = {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
};

const cache = new Map<string, ViaCepResult | null>();

export async function lookupCep(cep: string): Promise<ViaCepResult | null> {
  const digits = (cep || "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  if (cache.has(digits)) return cache.get(digits) ?? null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) {
      cache.set(digits, null);
      return null;
    }
    const data = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) {
      cache.set(digits, null);
      return null;
    }
    const result: ViaCepResult = {
      logradouro: data.logradouro ?? "",
      bairro: data.bairro ?? "",
      cidade: data.localidade ?? "",
      estado: data.uf ?? "",
    };
    cache.set(digits, result);
    return result;
  } catch {
    // Cache the failure too so repeated offline attempts for the same CEP
    // don't re-issue requests and slow down the import/edit flow.
    cache.set(digits, null);
    return null;
  }
}
