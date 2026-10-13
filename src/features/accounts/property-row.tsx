import type { getAccountOverview } from "./data";
import { AccountMaintenanceDisclosure, type Account } from "./account-row";
import { formatDecimalCurrency } from "@/lib/money";

type Overview = Awaited<ReturnType<typeof getAccountOverview>>;
type PropertyGroup = Overview["propertyGroups"][number];

function position(account: Account) {
  return account.currentBalance !== null && account.currency
    ? formatDecimalCurrency(account.currentBalance, account.currency)
    : "Position unavailable";
}

function magnitude(value: string) {
  return value.startsWith("-") ? value.slice(1) : value;
}

function debtOwed(value: string, currency: string) {
  return formatDecimalCurrency(magnitude(value), currency);
}

export function PropertyRow({
  account,
  propertyGroup,
  linkedDebts,
  today
}: {
  account: Account;
  propertyGroup?: PropertyGroup;
  linkedDebts: Account[];
  today: string;
}) {
  const equity =
    propertyGroup?.equity.status === "available"
      ? formatDecimalCurrency(
          propertyGroup.equity.amount,
          propertyGroup.equity.currency
        )
      : propertyGroup
        ? "Unavailable"
        : position(account);
  const availableEquity =
    propertyGroup?.equity.status === "available" ? propertyGroup.equity : null;
  const showUnlinkedBar =
    !propertyGroup &&
    account.currentBalance !== null &&
    Boolean(account.currency);

  return (
    <article
      className="property-ledger-entry"
      aria-labelledby={`property-${account.id}-title`}
    >
      <div className="property-visual-row">
        <div className="property-visual-main">
          <div className="property-name-line">
            <h3 id={`property-${account.id}-title`}>{account.name}</h3>
            <span>Estimated value {position(account)}</span>
          </div>
          {availableEquity?.isUnderwater ? (
            <div
              className="property-equity-bar is-underwater"
              role="img"
              aria-label={`Negative equity ${equity}. Property value ${formatDecimalCurrency(
                availableEquity.propertyAmount,
                availableEquity.currency
              )}; linked debt owed ${debtOwed(
                availableEquity.debtAmount,
                availableEquity.currency
              )}. Debt exceeds the property value.`}
            >
              <span className="property-underwater-segment">
                Negative equity <strong>{equity}</strong>
              </span>
            </div>
          ) : availableEquity ? (
            <div
              className="property-equity-bar"
              role="img"
              aria-label={
                linkedDebts.length
                  ? `Property value ${formatDecimalCurrency(
                      availableEquity.propertyAmount,
                      availableEquity.currency
                    )}; linked debt owed ${debtOwed(
                      availableEquity.debtAmount,
                      availableEquity.currency
                    )}; equity ${equity}`
                  : `Property value and equity ${equity}; no linked debt`
              }
            >
              {availableEquity.debtAmount !== "0.00" ? (
                <span
                  className="property-owed-segment"
                  style={{ flexGrow: magnitude(availableEquity.debtAmount) }}
                >
                  owed{" "}
                  {debtOwed(
                    availableEquity.debtAmount,
                    availableEquity.currency
                  )}
                </span>
              ) : null}
              <span
                className="property-equity-segment"
                style={{ flexGrow: magnitude(availableEquity.amount) || "1" }}
              >
                equity {equity}
              </span>
            </div>
          ) : showUnlinkedBar ? (
            <div
              className="property-equity-bar"
              role="img"
              aria-label={`Property value and equity ${equity}; no linked debt`}
            >
              <span className="property-equity-segment">equity {equity}</span>
            </div>
          ) : (
            <p className="account-unavailable">
              Owed/equity bar unavailable.{" "}
              {propertyGroup?.equity.status === "unavailable"
                ? propertyGroup.equity.reason
                : "The property position or currency is missing."}
            </p>
          )}
          <p className="property-mortgage-context">
            {linkedDebts.length
              ? `${linkedDebts.map((debt) => debt.name).join(", ")} · payment schedule unavailable`
              : "No related debt is linked."}
          </p>
        </div>
        <div className="property-equity-today">
          <span>Equity today</span>
          <strong>{equity}</strong>
          {availableEquity?.isUnderwater ? (
            <p className="property-negative-equity">
              Negative equity · debt exceeds the estimated value
            </p>
          ) : null}
          <p>Monthly equity movement unavailable</p>
        </div>
      </div>

      <div className="property-source-records">
        <AccountMaintenanceDisclosure
          account={account}
          propertyGroup={propertyGroup}
          today={today}
          label={`Property source and maintenance for ${account.name}`}
        />
        {linkedDebts.map((debt) => (
          <AccountMaintenanceDisclosure
            account={debt}
            relatedProperty={{ id: account.id, name: account.name }}
            today={today}
            label={`Debt source and maintenance for ${debt.name}`}
            instanceId={`property-${account.id}-maintenance`}
            key={debt.id}
          />
        ))}
      </div>
    </article>
  );
}
