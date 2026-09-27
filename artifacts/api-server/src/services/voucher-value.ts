const DECIMAL_AMOUNT = /^\d+(?:\.\d{1,2})?$/;

export function parseVoucherValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!DECIMAL_AMOUNT.test(raw)) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 && amount <= 99999999.99 ? amount : null;
}

export function isValidVoucherOverride(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return typeof value === "string" && (value.trim() === "" || parseVoucherValue(value) !== null);
}

export function resolveVoucherValue(employeeValue: string | null, companyValue: string): number {
  const companyAmount = parseVoucherValue(companyValue);
  if (companyAmount === null) throw new Error("Valor do vale da empresa inválido");
  return parseVoucherValue(employeeValue) ?? companyAmount;
}
