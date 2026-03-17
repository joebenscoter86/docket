const SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "$",
  AUD: "$",
  EUR: "€",
  GBP: "£",
};

export function getCurrencySymbol(currency: string | null): string {
  const code = currency ?? "USD";
  return SYMBOLS[code] ?? `${code} `;
}

export function formatCurrency(
  value: number | null,
  currency: string | null
): string {
  if (value === null) return "";
  const symbol = getCurrencySymbol(currency);
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

export function parseCurrencyInput(input: string): number | null {
  const cleaned = input.replace(/[$€£,]/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  if (isNaN(num) || num < 0) return null;
  return num;
}
