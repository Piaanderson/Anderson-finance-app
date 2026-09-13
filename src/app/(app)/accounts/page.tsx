import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireHousehold } from "@/server/households";
import { ConnectAccountButton } from "@/features/accounts/connect-account-button";
import { getAccounts } from "@/features/accounts/data";

export const metadata: Metadata = { title: "Accounts" };

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export default async function AccountsPage() {
  const owner = await requireHousehold();
  const accounts = await getAccounts(owner.householdId);

  return (
    <>
      <PageHeader title="Accounts" actions={<ConnectAccountButton />} />
      <div className="page-content">
        <div className="section-heading">
          <h2>{accounts.length} connected accounts</h2>
          <span className="muted">Balances update after Plaid syncs</span>
        </div>
        {accounts.length === 0 ? (
          <section className="empty-state" aria-labelledby="empty-title">
            <span className="eyebrow">Start here</span>
            <h2 id="empty-title">Connect your first account</h2>
            <p className="muted">
              Use Plaid Sandbox while developing. Bank credentials and access
              tokens never enter browser storage.
            </p>
          </section>
        ) : (
          <div className="account-grid">
            {accounts.map((account) => {
              const liability = ["credit", "loan"].includes(account.type);
              const value = liability
                ? -Math.abs(account.currentBalance)
                : account.currentBalance;
              return (
                <article className="card" key={account.id}>
                  <span className="eyebrow">
                    {account.institution} · {account.type}
                  </span>
                  <h2>{account.name}</h2>
                  <span
                    className={liability ? "card-value warning" : "card-value"}
                  >
                    {currency.format(value)}
                  </span>
                  <span className="muted">
                    {account.mask ? `•••• ${account.mask}` : "No account mask"}{" "}
                    ·{" "}
                    {account.connectionStatus
                      .toLowerCase()
                      .replaceAll("_", " ")}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
