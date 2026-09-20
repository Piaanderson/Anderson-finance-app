import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireHousehold } from "@/server/households";
import { ConnectAccountButton } from "@/features/accounts/connect-account-button";
import { classificationLabel } from "@/features/accounts/account-model";
import { ConnectionControls } from "@/features/accounts/connection-controls";
import { connectionState } from "@/features/accounts/connection-status";
import { getAccountOverview } from "@/features/accounts/data";
import { PlaidLinkProvider } from "@/features/accounts/plaid-link-provider";

export const metadata: Metadata = { title: "Accounts" };

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});
const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

export default async function AccountsPage() {
  const owner = await requireHousehold();
  const { accounts, connections } = await getAccountOverview(owner.householdId);

  return (
    <PlaidLinkProvider>
      <PageHeader title="Accounts" actions={<ConnectAccountButton />} />
      <div className="page-content">
        {connections.length === 0 && accounts.length === 0 ? (
          <section className="empty-state" aria-labelledby="empty-title">
            <span className="eyebrow">Start here</span>
            <h2 id="empty-title">Connect your first account</h2>
            <p className="muted">
              Use Plaid Sandbox while developing. Bank credentials and access
              tokens never enter browser storage.
            </p>
          </section>
        ) : (
          <>
            <section className="stack" aria-labelledby="connections-title">
              <div className="section-heading">
                <h2 id="connections-title">
                  {connections.length} bank{" "}
                  {connections.length === 1 ? "connection" : "connections"}
                </h2>
                <span className="muted">
                  Status and recovery for each institution
                </span>
              </div>
              <div className="connection-list">
                {connections.length === 0 ? (
                  <p className="muted">
                    No bank connections. Manual accounts remain available
                    without Plaid.
                  </p>
                ) : (
                  connections.map((connection) => {
                    const state = connectionState({
                      status: connection.status,
                      jobStatus: connection.job?.status ?? null,
                      jobAttempts: connection.job?.attempts ?? 0,
                      lastSyncedAt: connection.lastSyncedAt
                    });
                    const statusDescriptionId = `connection-${connection.id}-status`;
                    const headingId = `connection-${connection.id}-title`;
                    return (
                      <article
                        className="card connection-card"
                        key={connection.id}
                        aria-labelledby={headingId}
                      >
                        <div className="connection-card-header">
                          <div>
                            <span className="eyebrow">Plaid connection</span>
                            <h3 id={headingId}>{connection.institution}</h3>
                          </div>
                          <span className={`connection-state ${state.kind}`}>
                            {state.label}
                          </span>
                        </div>
                        <div id={statusDescriptionId}>
                          <p>{state.detail}</p>
                          <p className="muted">
                            {connection.lastSyncedAt ? (
                              <>
                                Last synced{" "}
                                <time
                                  dateTime={connection.lastSyncedAt.toISOString()}
                                >
                                  {dateTime.format(connection.lastSyncedAt)}
                                </time>
                              </>
                            ) : (
                              "No completed sync yet"
                            )}{" "}
                            · {connection.accountCount} active{" "}
                            {connection.accountCount === 1
                              ? "account"
                              : "accounts"}
                          </p>
                        </div>
                        <ConnectionControls
                          itemId={connection.id}
                          institution={connection.institution}
                          action={state.action}
                          statusDescriptionId={statusDescriptionId}
                        />
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <section className="stack" aria-labelledby="accounts-title">
              <div className="section-heading">
                <h2 id="accounts-title">
                  {accounts.length}{" "}
                  {accounts.length === 1 ? "account" : "accounts"}
                </h2>
                <span className="muted">
                  Signed positions from the latest recorded balance
                </span>
              </div>
              {accounts.length === 0 ? (
                <p className="muted">
                  Accounts will appear after this connection completes a sync.
                </p>
              ) : (
                <div className="account-grid">
                  {accounts.map((account) => {
                    const liability = account.classification === "DEBT";
                    return (
                      <article className="card" key={account.id}>
                        <span className="eyebrow">
                          {classificationLabel(account.classification)} ·{" "}
                          {account.institution}
                        </span>
                        <h3>{account.name}</h3>
                        <span
                          className={
                            liability ? "card-value warning" : "card-value"
                          }
                        >
                          {currency.format(account.currentBalance)}
                        </span>
                        <span className="muted">
                          {account.mask
                            ? `•••• ${account.mask}`
                            : account.source === "MANUAL"
                              ? "Manual balance"
                              : "No account mask"}
                        </span>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PlaidLinkProvider>
  );
}
