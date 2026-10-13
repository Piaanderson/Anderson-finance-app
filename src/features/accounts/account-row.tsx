import Link from "next/link";
import type { getAccountOverview } from "./data";
import { updateManualAccountAction } from "./actions";
import { connectionState } from "./connection-status";
import {
  ArchiveManualAccount,
  UnlinkPropertyDebt
} from "./manual-account-controls";
import { ManualAccountForm } from "./manual-account-form";
import { ManualAccountEditTrigger } from "./manual-account-edit-trigger";
import { PlaidClassificationForm } from "./plaid-classification-form";
import { formatDecimalCurrency, formatMovementAmount } from "@/lib/money";

type Overview = Awaited<ReturnType<typeof getAccountOverview>>;
export type Account = Overview["accounts"][number];
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

function connectionLabel(account: Account) {
  if (!account.connection) return "Manual";
  const state = connectionState({
    status: account.connection.status,
    jobStatus: account.connection.job?.status ?? null,
    jobAttempts: account.connection.job?.attempts ?? 0,
    lastSyncedAt: account.connection.lastSyncedAt
  });
  const time = account.connection.lastSyncedAt
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }).format(account.connection.lastSyncedAt)
    : null;
  if (state.kind !== "healthy") {
    return time ? `${state.label} · last sync ${time}` : state.label;
  }
  return time ?? state.label;
}

function AccountMaintenanceContent({
  account,
  propertyGroup,
  relatedProperty,
  today,
  detailsId
}: {
  account: Account;
  propertyGroup?: PropertyGroup;
  relatedProperty?: { id: string; name: string };
  today: string;
  detailsId: string;
}) {
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
    <div className="account-maintenance-panel" id={detailsId}>
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
            Currents changes this position only when you save a dated valuation.
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
            <time dateTime={account.latestSnapshot.effectiveAt.toISOString()}>
              {date.format(account.latestSnapshot.effectiveAt)}
            </time>
            .
          </p>
        ) : (
          <p className="warning">
            Observation date unavailable. This position is excluded from history
            until a real snapshot is recorded.
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
          Provider-reported availability is shown only when supplied and never
          enters net worth.
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
              Showing {account.recentActivity.length} of {account.activityCount}{" "}
              recorded{" "}
              {account.activityCount === 1 ? "transaction" : "transactions"}.
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

      {propertyGroup ? (
        <section
          className="property-pair"
          aria-labelledby={`${detailsId}-equity`}
        >
          <h4 id={`${detailsId}-equity`}>Related debt and derived equity</h4>
          <p>
            Property value: <strong>{displayedPosition(account)}</strong>
          </p>
          {propertyGroup.debts.map((debt) => (
            <div className="property-debt-row" key={debt.linkId}>
              <p>
                {debt.name}:{" "}
                <strong>
                  {debt.currentBalance !== null && debt.currency
                    ? formatDecimalCurrency(debt.currentBalance, debt.currency)
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
              ? "Equity adds the separate property and signed debt positions. The source records remain traceable."
              : propertyGroup.equity.reason}
          </p>
        </section>
      ) : null}

      {relatedProperty ? (
        <section aria-labelledby={`${detailsId}-property`}>
          <h4 id={`${detailsId}-property`}>Related property</h4>
          <p>
            Linked to <strong>{relatedProperty.name}</strong>. This debt remains
            a separate source record and is represented through home equity.
          </p>
        </section>
      ) : null}

      <section
        className="account-actions"
        id={`${detailsId}-maintenance`}
        aria-labelledby={`${detailsId}-actions`}
      >
        <h4 id={`${detailsId}-actions`}>Account maintenance</h4>
        {account.source === "MANUAL" ? (
          <details id={`${detailsId}-editor`}>
            <summary>Edit valuation, name, or archive</summary>
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
  );
}

function AccountPrimaryDetail({
  account,
  propertyGroup,
  relatedProperty,
  today,
  detailsId
}: {
  account: Account;
  propertyGroup?: PropertyGroup;
  relatedProperty?: { id: string; name: string };
  today: string;
  detailsId: string;
}) {
  const supportId = `${detailsId}-support`;
  const supportDisclosureId = `${supportId}-disclosure`;
  return (
    <div className="account-detail-panel" id={detailsId}>
      <section
        className="account-schedule-panel"
        aria-labelledby={`${detailsId}-schedule`}
      >
        <h4 id={`${detailsId}-schedule`}>Scheduled before month end</h4>
        <div className="account-unavailable">
          <strong>Schedule unavailable</strong>
          <p>
            Currents has no sourced bill or paycheck schedule for this account.
          </p>
        </div>
        <div className="account-ending-bridge">
          <span>Ending balance</span>
          <span>
            {displayedPosition(account)} <b aria-hidden="true">→</b>{" "}
            <strong>Unavailable</strong>
          </span>
        </div>
      </section>

      <section
        className="account-budget-role"
        aria-labelledby={`${detailsId}-budget-role`}
      >
        <h4 id={`${detailsId}-budget-role`}>Its role in the budget</h4>
        {account.budgetRole.length ? (
          <p>
            {account.budgetRole
              .map((allocation) => allocation.category)
              .join(", ")}{" "}
            {account.budgetRole.length === 1 ? "is" : "are"} planned to use this
            account this month.
          </p>
        ) : (
          <p className="muted">
            No current-month budget categories are assigned to this account.
          </p>
        )}
        <div className="account-projection-card">
          <div>
            <span>Projected by next paycheck</span>
            <strong>Unavailable</strong>
          </div>
          <div
            className="account-floor-meter is-unavailable"
            role="img"
            aria-label="Balance floor unavailable"
          >
            <span />
          </div>
          <p>
            Balance floor unavailable. Currents does not invent a future
            balance, paycheck date, or comfort threshold.
          </p>
        </div>
        <div className="account-primary-actions">
          <button
            className="button secondary"
            type="button"
            disabled
            title="Reconciliation workflow is unavailable"
          >
            Reconcile
          </button>
          {account.source === "MANUAL" ? (
            <ManualAccountEditTrigger
              accountName={account.name}
              supportDetailsId={supportDisclosureId}
              editDetailsId={`${supportId}-editor`}
            />
          ) : (
            <button
              className="button secondary"
              type="button"
              disabled
              title="Connected account names come from the provider"
            >
              Rename
            </button>
          )}
          <Link
            className="button secondary"
            href={`/transactions?query=${encodeURIComponent(account.name)}`}
          >
            See in Transactions
          </Link>
        </div>
      </section>

      <details className="account-support-disclosure" id={supportDisclosureId}>
        <summary aria-controls={supportId}>
          Source, activity, and account maintenance
        </summary>
        <AccountMaintenanceContent
          account={account}
          propertyGroup={propertyGroup}
          relatedProperty={relatedProperty}
          today={today}
          detailsId={supportId}
        />
      </details>
    </div>
  );
}

export function AccountMaintenanceDisclosure({
  account,
  propertyGroup,
  relatedProperty,
  today,
  label,
  instanceId
}: {
  account: Account;
  propertyGroup?: PropertyGroup;
  relatedProperty?: { id: string; name: string };
  today: string;
  label: string;
  instanceId?: string;
}) {
  const detailsId = `account-${account.id}-${instanceId ?? "maintenance"}`;
  return (
    <details className="account-maintenance-disclosure">
      <summary aria-controls={detailsId}>{label}</summary>
      <AccountMaintenanceContent
        account={account}
        propertyGroup={propertyGroup}
        relatedProperty={relatedProperty}
        today={today}
        detailsId={detailsId}
      />
    </details>
  );
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

  return (
    <article className="account-ledger-entry" aria-labelledby={headingId}>
      <details className="account-details">
        <summary className="account-ledger-row" aria-controls={detailsId}>
          <span className="account-name-cell">
            <h3 id={headingId}>{account.name}</h3>
            <span>
              {[account.subtype, account.mask ? `••${account.mask}` : null]
                .filter(Boolean)
                .join(" · ") || account.institution}
            </span>
          </span>
          <span className="account-ledger-cell account-connection-cell">
            <span className="account-cell-label">Connection</span>
            <span
              className={`account-connection ${connection?.kind ?? "manual"}`}
            >
              <i aria-hidden="true" />
              {connectionLabel(account)}
            </span>
          </span>
          <span className="account-ledger-cell account-money-cell">
            <span className="account-cell-label">Balance today</span>
            <strong
              className={account.classification === "DEBT" ? "warning" : ""}
            >
              {displayedPosition(account)}
            </strong>
          </span>
          <span className="account-ledger-cell account-money-cell is-unavailable">
            <span className="account-cell-label">Before month end</span>
            <span>Unavailable</span>
          </span>
          <span className="account-ledger-cell account-money-cell is-unavailable">
            <span className="account-cell-label">Projected</span>
            <span>Unavailable</span>
          </span>
          <span className="visually-hidden">Toggle account details</span>
        </summary>
        <AccountPrimaryDetail
          account={account}
          propertyGroup={propertyGroup}
          relatedProperty={relatedProperty}
          today={today}
          detailsId={detailsId}
        />
      </details>
    </article>
  );
}
