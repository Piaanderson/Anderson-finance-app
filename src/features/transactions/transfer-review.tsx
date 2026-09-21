"use client";

import { useId, useState } from "react";
import { formatMovementAmount } from "@/lib/money";
import type {
  TransferSuggestion,
  TransferSuggestionCandidate,
  TransferSuggestionLeg
} from "./transfer-suggestions";

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function longDate(value: string | null) {
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

function signedAmount(leg: TransferSuggestionLeg) {
  const formatted = formatMovementAmount(leg.absoluteAmount, leg.currency);
  return leg.signedAmount.startsWith("-") ? `+${formatted}` : `−${formatted}`;
}

function accountLabel(leg: TransferSuggestionLeg) {
  return `${leg.account.name}${
    leg.account.mask ? ` · ${leg.account.mask}` : ""
  }`;
}

function CandidateLeg({
  leg,
  direction
}: {
  leg: TransferSuggestionLeg;
  direction: "out" | "in";
}) {
  return (
    <li className="suggestion-leg">
      <div>
        <span className="eyebrow">
          {direction === "out" ? "Money out" : "Money in"}
        </span>
        <strong>{leg.description}</strong>
        <span className="muted">
          {shortDate(leg.effectiveDate)} · {accountLabel(leg)}
        </span>
      </div>
      <strong className="row-amount">{signedAmount(leg)}</strong>
    </li>
  );
}

function LegInspection({
  leg,
  direction,
  headingId
}: {
  leg: TransferSuggestionLeg;
  direction: "out" | "in";
  headingId: string;
}) {
  return (
    <section className="transfer-leg" aria-labelledby={headingId}>
      <div className="transfer-leg-heading">
        <div>
          <span className="eyebrow">
            {direction === "out" ? "Money out" : "Money in"}
          </span>
          <h3 id={headingId}>{accountLabel(leg)}</h3>
        </div>
        <strong className="row-amount">{signedAmount(leg)}</strong>
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
          <dd>{longDate(leg.authorizedDate)}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>{longDate(leg.postedDate)}</dd>
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
  );
}

export function TransferReview({
  suggestion,
  queueCount,
  busy,
  onTie,
  onSkip
}: {
  suggestion: TransferSuggestion;
  queueCount: number;
  busy: boolean;
  onTie: (candidate: TransferSuggestionCandidate) => void;
  onSkip: () => void;
}) {
  const reactId = useId().replaceAll(":", "");
  const detailId = `suggestion-details-${reactId}`;
  const headingId = `transfer-review-${reactId}`;
  const [selectedId, setSelectedId] = useState(
    suggestion.candidates[0]?.id ?? ""
  );
  const [expanded, setExpanded] = useState(false);

  const selected =
    suggestion.candidates.find((candidate) => candidate.id === selectedId) ??
    suggestion.candidates[0];
  if (!selected) return null;

  return (
    <section
      className="card transfer-review"
      aria-labelledby={headingId}
      data-review-order="transfers"
    >
      <div className="review-heading">
        <div>
          <span className="eyebrow">
            Transfers first · {queueCount} to review
          </span>
          <h2 id={headingId}>Transfers to verify</h2>
        </div>
        <span className="review-status">
          {suggestion.ambiguous
            ? "Ambiguous · choose carefully"
            : "Suggested pair · confirmation required"}
        </span>
      </div>
      <p className="muted">
        These unmatched legs may be one movement. Currents never ties them
        without your confirmation.
      </p>

      {suggestion.candidates.length > 1 ? (
        <fieldset className="candidate-choices">
          <legend>Choose the incoming leg to inspect</legend>
          {suggestion.candidates.map((candidate, index) => (
            <label key={candidate.id}>
              <input
                type="radio"
                name={`candidate-${reactId}`}
                value={candidate.id}
                checked={selected.id === candidate.id}
                onChange={() => {
                  setSelectedId(candidate.id);
                  setExpanded(false);
                }}
              />
              <span>
                {candidate.incoming.description} ·{" "}
                {candidate.incoming.account.name} ·{" "}
                {candidate.dateDistanceDays === 0
                  ? "same day"
                  : `${candidate.dateDistanceDays} day${
                      candidate.dateDistanceDays === 1 ? "" : "s"
                    } apart`}
                {index === 0 ? " · highest ranked" : ""}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {suggestion.ambiguityReason ? (
        <p className="review-warning">
          <strong>Needs your judgment:</strong> {suggestion.ambiguityReason}
        </p>
      ) : null}

      <div>
        <h3 className="suggestion-title">Unmatched-leg tray</h3>
        <ul className="suggestion-legs" aria-label="Suggested transfer legs">
          <CandidateLeg leg={selected.outgoing} direction="out" />
          <CandidateLeg leg={selected.incoming} direction="in" />
        </ul>
      </div>

      <div className="candidate-explanation">
        <h3>Why this is suggested</h3>
        <ul>
          {selected.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <button
        className="movement-disclosure"
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Hide both candidate legs" : "Inspect both candidate legs"}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <div
          id={detailId}
          className="transfer-candidate-details"
          role="region"
          aria-labelledby={headingId}
        >
          <LegInspection
            leg={selected.outgoing}
            direction="out"
            headingId={`${detailId}-out`}
          />
          <LegInspection
            leg={selected.incoming}
            direction="in"
            headingId={`${detailId}-in`}
          />
        </div>
      ) : null}

      <div className="review-actions">
        <button
          className="button"
          type="button"
          disabled={busy}
          data-transfer-primary-action
          onClick={() => onTie(selected)}
        >
          {busy ? "Tying transfer…" : "Tie as one transfer"}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={onSkip}
        >
          Skip for now
        </button>
      </div>
    </section>
  );
}
