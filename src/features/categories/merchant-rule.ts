export function normalizeMerchantRuleKey(value: string) {
  return value
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function merchantRuleKey({
  merchantName,
  name
}: {
  merchantName: string | null | undefined;
  name: string;
}) {
  return normalizeMerchantRuleKey(merchantName?.trim() || name);
}
