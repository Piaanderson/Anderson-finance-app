export const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function signedUsd(value: number) {
  return value < 0 ? `−${usd.format(Math.abs(value))}` : usd.format(value);
}
