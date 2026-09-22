export function merchantRuleKey({
  merchantName,
  name
}: {
  merchantName: string | null | undefined;
  name: string;
}) {
  return (merchantName?.trim() || name.trim())
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}
