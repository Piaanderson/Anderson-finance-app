"use client";

import { useId, useState } from "react";
import { formatMovementAmount } from "@/lib/money";
import type { HouseholdMovement } from "./movements";
import { TransferDetails } from "./transfer-details";

function movementDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function transactionAmount(movement: HouseholdMovement) {
  const amount = movement.amounts[0];
  const formatted = formatMovementAmount(amount.value, amount.currency);
  if (movement.direction === "OUTFLOW") return `−${formatted}`;
  if (movement.direction === "INFLOW") return `+${formatted}`;
  return formatted;
}

function transferAmount(movement: HouseholdMovement) {
  return movement.amounts
    .map((amount) => formatMovementAmount(amount.value, amount.currency))
    .join(" → ");
}

export function TransactionRow({
  movement,
  untieBusy = false,
  onUntie
}: {
  movement: HouseholdMovement;
  untieBusy?: boolean;
  onUntie?: (
    movement: Extract<HouseholdMovement, { kind: "TRANSFER" }>
  ) => void;
}) {
  const reactId = useId().replaceAll(":", "");
  const detailId = `movement-details-${reactId}`;
  const labelId = `movement-label-${reactId}`;
  const [expanded, setExpanded] = useState(false);
  const transfer = movement.kind === "TRANSFER";
  const accounts = movement.legs
    .map(
      (leg) =>
        `${leg.account.name}${leg.account.mask ? ` · ${leg.account.mask}` : ""}`
    )
    .join(" → ");

  return (
    <article
      className="movement-row"
      id={
        movement.kind === "TRANSACTION"
          ? `movement-transaction-${movement.legs[0].transactionId}`
          : `movement-transfer-${movement.matchId}`
      }
      tabIndex={-1}
      aria-labelledby={labelId}
    >
      <div className="movement-summary">
        <div className="movement-primary">
          <div>
            <h3 id={labelId}>{movement.description}</h3>
            <p className="muted">
              {accounts} · {movementDate(movement.canonicalDate)}
              {movement.pending ? " · Pending" : ""}
            </p>
          </div>
          <div className="movement-amount">
            <strong>
              {transfer
                ? transferAmount(movement)
                : transactionAmount(movement)}
            </strong>
            <span className="muted">
              {transfer
                ? "Internal transfer · counted once"
                : movement.direction === "OUTFLOW"
                  ? "Money out"
                  : movement.direction === "INFLOW"
                    ? "Money in"
                    : "No balance change"}
            </span>
          </div>
        </div>
        <div className="movement-secondary">
          <span className="movement-category">
            {transfer
              ? "Transfer"
              : (movement.category?.name ??
                movement.legs[0].transactionCode ??
                "Uncategorized")}
          </span>
          {transfer ? (
            <button
              className="movement-disclosure"
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Hide both transfer legs" : "View both transfer legs"}
              <span aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
          ) : null}
        </div>
      </div>
      {transfer && expanded ? (
        <TransferDetails
          id={detailId}
          labelledBy={labelId}
          legs={movement.legs}
          untieBusy={untieBusy}
          onUntie={onUntie ? () => onUntie(movement) : undefined}
        />
      ) : null}
    </article>
  );
}
