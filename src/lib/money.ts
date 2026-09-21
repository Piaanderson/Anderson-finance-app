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
