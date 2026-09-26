import type { getAccountOverview } from "./data";
import { updateManualAccountAction } from "./actions";
import { connectionState } from "./connection-status";
import {
  ArchiveManualAccount,
  UnlinkPropertyDebt
} from "./manual-account-controls";
import { ManualAccountForm } from "./manual-account-form";
import { PlaidClassificationForm } from "./plaid-classification-form";
import { formatDecimalCurrency, formatMovementAmount } from "@/lib/money";

type Overview = Awaited<ReturnType<typeof getAccountOverview>>;
type Account = Overview["accounts"][number];
type PropertyGroup = Overview["propertyGroups"][number];

const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC"
});
const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

function displayedPosition(account: Account) {
  if (account.currentBalance === null || !account.currency) {
    return "Position unavailable";
  }
  return formatDecimalCurrency(account.currentBalance, account.currency);
}

function activityAmount(activity: Account["recentActivity"][number]) {
  return formatMovementAmount(activity.displayAmount, {
    kind: activity.isoCurrencyCode
      ? "ISO"
      : activity.unofficialCurrencyCode
        ? "UNOFFICIAL"
        : "UNKNOWN",
    code: activity.isoCurrencyCode ?? activity.unofficialCurrencyCode
  });
}

export function AccountRow({
  account,
  propertyGroup,
  relatedProperty,
  today
}: {
  account: Account;
  propertyGroup?: PropertyGroup;
  relatedProperty?: { id: string; name: string };
  today: string;
}) {
  const headingId = `account-${account.id}-title`;
  const detailsId = `account-${account.id}-details`;
  const connection = account.connection
    ? connectionState({
        status: account.connection.status,
        jobStatus: account.connection.job?.status ?? null,
        jobAttempts: account.connection.job?.attempts ?? 0,
        lastSyncedAt: account.connection.lastSyncedAt
      })
    : null;
  const sourceLabel =
    account.source === "PLAID" ? "Connected with Plaid" : "Manual account";

  return (
    <article className="account-row" aria-labelledby={headingId}>
      <h3 id={headingId}>{account.name}</h3>
      <div className="account-row-meta">
        <span>{sourceLabel}</span>
        {account.mask ? <span>•••• {account.mask}</span> : null}
        {account.subtype ? <span>{account.subtype}</span> : null}
        {connection ? (
          <span className={`connection-state ${connection.kind}`}>
            {connection.label}
          </span>
        ) : (
          <span className="connection-state manual">Manual valuation</span>
        )}
      </div>
      <strong
        className={
          account.classification === "DEBT"
            ? "account-row-value warning"
            : "account-row-value"
        }
      >
        {displayedPosition(account)}
      </strong>
      <details className="account-details">
        <summary aria-controls={detailsId}>View account details</summary>
        <div className="account-detail-panel" id={detailsId}>
          <section aria-labelledby={`${detailsId}-status`}>
            <h4 id={`${detailsId}-status`}>Source and status</h4>
            <p>
              <strong>{sourceLabel}</strong> · {account.institution}
            </p>
            {connection ? (
              <>
                <p>{connection.detail}</p>
                <p className="muted">
                  {account.connection?.lastSyncedAt ? (
                    <>
                      Last synced{" "}
                      <time
                        dateTime={account.connection.lastSyncedAt.toISOString()}
                      >
                        {dateTime.format(account.connection.lastSyncedAt)}
                      </time>
                    </>
                  ) : (
                    "No completed sync yet"
                  )}
                </p>
              </>
            ) : (
              <p className="muted">
                Currents changes this position only when you save a dated
                valuation.
              </p>
            )}
          </section>

          <section aria-labelledby={`${detailsId}-position`}>
            <h4 id={`${detailsId}-position`}>Current position</h4>
            <p>
              <strong>{displayedPosition(account)}</strong>
            </p>
            {account.latestSnapshot ? (
              <p className="muted">
                Sourced from a{" "}
                {account.latestSnapshot.source === "PLAID_SYNC"
                  ? "Plaid balance observation"
                  : "manual valuation"}{" "}
                effective{" "}
                <time
                  dateTime={account.latestSnapshot.effectiveAt.toISOString()}
                >
                  {date.format(account.latestSnapshot.effectiveAt)}
                </time>
                .
              </p>
            ) : (
              <p className="warning">
                Observation date unavailable. This position is excluded from
                history until a real snapshot is recorded.
              </p>
            )}
            <p>
              Available balance:{" "}
              <strong>
                {account.availableBalance !== null && account.currency
                  ? formatDecimalCurrency(
                      account.availableBalance,
                      account.currency
                    )
                  : "Not provided"}
              </strong>
            </p>
            <p className="muted">
              Provider-reported availability is shown only when supplied and
              never enters net worth.
            </p>
          </section>

          <section aria-labelledby={`${detailsId}-activity`}>
            <h4 id={`${detailsId}-activity`}>Recent activity</h4>
            {account.recentActivity.length ? (
              <>
                <ul className="account-activity-list">
                  {account.recentActivity.map((activity) => (
                    <li key={activity.id}>
                      <span>
                        <time dateTime={activity.date.toISOString()}>
                          {date.format(activity.date)}
                        </time>{" "}
                        · {activity.merchantName ?? activity.name}
                        {activity.pending ? " · Pending" : ""}
                      </span>
                      <strong>{activityAmount(activity)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="muted">
                  Showing {account.recentActivity.length} of{" "}
                  {account.activityCount} recorded{" "}
                  {account.activityCount === 1 ? "transaction" : "transactions"}
                  .
                </p>
              </>
            ) : (
              <p className="muted">
                {account.source === "MANUAL"
                  ? "No imported activity is attached to this manual account."
                  : "No recent imported activity is available."}
              </p>
            )}
          </section>

          <section aria-labelledby={`${detailsId}-projection`}>
            <h4 id={`${detailsId}-projection`}>Projection</h4>
            <p>
              <strong>Unavailable</strong>
            </p>
            <p className="muted">
              Currents does not infer a future balance from current positions or
              reconstruct one from transactions.
            </p>
          </section>

          {propertyGroup ? (
            <section
              className="property-pair"
              aria-labelledby={`${detailsId}-equity`}
            >
              <h4 id={`${detailsId}-equity`}>
                Related debt and derived equity
              </h4>
              <p>
                Property value: <strong>{displayedPosition(account)}</strong>
              </p>
              {propertyGroup.debts.map((debt) => (
                <div className="property-debt-row" key={debt.linkId}>
                  <p>
                    {debt.name}:{" "}
                    <strong>
                      {debt.currentBalance !== null && debt.currency
                        ? formatDecimalCurrency(
                            debt.currentBalance,
                            debt.currency
                          )
                        : "Position unavailable"}
                    </strong>
                  </p>
                  <UnlinkPropertyDebt
                    linkId={debt.linkId}
                    propertyName={propertyGroup.property.name}
                    debtName={debt.name}
                  />
                </div>
              ))}
              <p className="property-equity">
                Derived equity:{" "}
                <strong>
                  {propertyGroup.equity.status === "available"
                    ? formatDecimalCurrency(
                        propertyGroup.equity.amount,
                        propertyGroup.equity.currency
                      )
                    : "Unavailable"}
                </strong>
              </p>
              <p className="muted">
                {propertyGroup.equity.status === "available"
                  ? "Equity adds the separate property and signed debt positions. Group subtotals still retain both source records."
                  : propertyGroup.equity.reason}
              </p>
            </section>
          ) : null}

          {relatedProperty ? (
            <section aria-labelledby={`${detailsId}-property`}>
              <h4 id={`${detailsId}-property`}>Related property</h4>
              <p>
                Linked to <strong>{relatedProperty.name}</strong>. This debt
                remains a separate record in the Debt subtotal.
              </p>
            </section>
          ) : null}

          <section
            className="account-actions"
            aria-labelledby={`${detailsId}-actions`}
          >
            <h4 id={`${detailsId}-actions`}>Account actions</h4>
            {account.source === "MANUAL" ? (
              <details>
                <summary>Edit or archive</summary>
                <ManualAccountForm
                  action={updateManualAccountAction}
                  heading={`Edit ${account.name}`}
                  headingLevel="h4"
                  submitLabel="Save account"
                  today={today}
                  account={account}
                />
                <ArchiveManualAccount
                  accountId={account.id}
                  accountName={account.name}
                />
              </details>
            ) : (
              <a
                className="button secondary"
                href={`#connection-${account.plaidItemId}`}
              >
                Manage {account.institution} connection
              </a>
            )}
            {account.classification === "UNCLASSIFIED" ? (
              <PlaidClassificationForm
                accountId={account.id}
                accountName={account.name}
              />
            ) : null}
          </section>
        </div>
      </details>
    </article>
  );
}
