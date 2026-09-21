export const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function signedUsd(value: number) {
  return value < 0 ? `−${usd.format(Math.abs(value))}` : usd.format(value);
}

export function formatCurrency(value: number, currency: string) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  });
  return value < 0
    ? `−${formatter.format(Math.abs(value))}`
    : formatter.format(value);
}

export function formatMovementAmount(
  value: string,
  currency: {
    kind: "ISO" | "UNOFFICIAL" | "UNKNOWN";
    code: string | null;
  }
) {
  if (currency.kind === "ISO" && currency.code) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.code
    }).format(Number(value));
  }
  const amount = Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (currency.kind === "UNOFFICIAL" && currency.code) {
    return `${amount} ${currency.code} (unofficial currency)`;
  }
  return `${amount} (currency unavailable)`;
}
