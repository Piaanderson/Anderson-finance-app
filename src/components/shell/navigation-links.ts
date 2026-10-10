export const appNavigationLinks = [
  { href: "/dashboard", label: "Home" },
  { href: "/budget", label: "Budget" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/settings/security", label: "Security" }
] as const;

export const mobileQuickLinks = appNavigationLinks.filter((link) =>
  ["/dashboard", "/budget", "/transactions"].includes(link.href)
);
