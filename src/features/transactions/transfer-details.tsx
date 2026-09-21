import { formatMovementAmount } from "@/lib/money";
import type { MovementLeg } from "./movements";

function date(value: string | null) {
  if (!value) return "Not provided";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function available(value: string | null) {
  return value?.trim() || "Not provided";
}

function signedLegAmount(leg: MovementLeg) {
  const formatted = formatMovementAmount(leg.amount.value, leg.amount.currency);
  if (leg.direction === "OUTFLOW") return `−${formatted}`;
  if (leg.direction === "INFLOW") return `+${formatted}`;
  return formatted;
}

export function TransferDetails({
  id,
  legs,
  labelledBy
}: {
  id: string;
  legs: [MovementLeg, MovementLeg];
  labelledBy: string;
}) {
  return (
    <div
      className="transfer-details"
      id={id}
      role="region"
      aria-labelledby={labelledBy}
    >
      <p className="transfer-status">
        Matched transfer · one movement with two unchanged source transactions.
      </p>
      <div className="transfer-leg-grid">
        {legs.map((leg) => (
          <section
            className="transfer-leg"
            key={leg.transactionId}
            aria-labelledby={`${id}-${leg.role.toLowerCase()}`}
          >
            <div className="transfer-leg-heading">
              <div>
                <span className="eyebrow">
                  {leg.role === "OUTGOING" ? "Money out" : "Money in"}
                </span>
                <h4 id={`${id}-${leg.role.toLowerCase()}`}>
                  {leg.account.name}
                  {leg.account.mask ? ` · ${leg.account.mask}` : ""}
                </h4>
              </div>
              <strong className="row-amount">{signedLegAmount(leg)}</strong>
            </div>
            <dl className="movement-metadata">
              <div>
                <dt>Bank description</dt>
                <dd>{available(leg.bankDescription)}</dd>
              </div>
              <div>
                <dt>Plaid description</dt>
                <dd>{available(leg.name)}</dd>
              </div>
              <div>
                <dt>Merchant</dt>
                <dd>{available(leg.merchantName)}</dd>
              </div>
              <div>
                <dt>Memo</dt>
                <dd>{available(leg.paymentMemo)}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{available(leg.referenceNumber)}</dd>
              </div>
              <div>
                <dt>Authorized</dt>
                <dd>{date(leg.authorizedDate)}</dd>
              </div>
              <div>
                <dt>Posted</dt>
                <dd>{date(leg.postedDate)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{leg.pending ? "Pending" : "Posted"}</dd>
              </div>
              <div>
                <dt>Payment channel</dt>
                <dd>{available(leg.paymentChannel)}</dd>
              </div>
              <div>
                <dt>Transaction code</dt>
                <dd>{available(leg.transactionCode)}</dd>
              </div>
              <div>
                <dt>Check number</dt>
                <dd>{available(leg.checkNumber)}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <p className="muted">
        Balance movement unavailable. Currents does not reconstruct a running
        balance from today&apos;s account balance or an unaligned snapshot.
      </p>
    </div>
  );
}
