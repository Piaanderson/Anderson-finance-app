"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  CategoryReviewChoice,
  MerchantRuleReview
} from "@/features/categories/category-data";
import { GroupedCategoryPicker } from "@/features/categories/grouped-category-picker";
import {
  merchantRuleKey,
  normalizeMerchantRuleKey
} from "@/features/categories/merchant-rule";
import { formatMovementAmount } from "@/lib/money";
import type {
  HouseholdMovement,
  TransactionMovement,
  TransferMovement
} from "./movements";
import { TransferDetails } from "./transfer-details";
import type {
  CategoryAssignmentOptions,
  MerchantRuleAction
} from "./transactions-workspace";

function available(value: string | null) {
  return value?.trim() || "Not provided";
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

function amountLabel(movement: HouseholdMovement) {
  const labels = movement.amounts.map((amount) =>
    formatMovementAmount(amount.value, amount.currency)
  );
  if (movement.kind === "TRANSFER") return labels.join(" → ");
  if (movement.direction === "OUTFLOW") return `−${labels[0]}`;
  if (movement.direction === "INFLOW") return `+${labels[0]}`;
  return labels[0];
}

export function TransactionDetailDrawer({
  movement,
  categories,
  existingRule,
  busy,
  returnFocus,
  onClose,
  onAssignCategory,
  onUntie
}: {
  movement: HouseholdMovement | null;
  categories: CategoryReviewChoice[];
  existingRule: MerchantRuleReview | null;
  busy: boolean;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onAssignCategory: (
    movement: TransactionMovement,
    category: CategoryReviewChoice,
    options: CategoryAssignmentOptions
  ) => Promise<boolean>;
  onUntie: (movement: TransferMovement) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const reactId = useId().replaceAll(":", "");
  const movementId = movement?.id ?? null;
  const [editorMovementId, setEditorMovementId] = useState(movementId);
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    movement?.kind === "TRANSACTION" ? (movement.category?.id ?? "") : ""
  );
  const defaultRuleKey =
    movement?.kind === "TRANSACTION"
      ? merchantRuleKey({
          merchantName: movement.legs[0].merchantName,
          name: movement.legs[0].name
        })
      : "";
  const [ruleAction, setRuleAction] = useState<MerchantRuleAction>("PRESERVE");
  const [ruleKeyInput, setRuleKeyInput] = useState(
    existingRule?.merchantKey ?? defaultRuleKey
  );
  const [assignmentError, setAssignmentError] = useState("");
  const [closeAfterCategoryId, setCloseAfterCategoryId] = useState<
    string | null
  >(null);
  if (movementId !== editorMovementId) {
    setEditorMovementId(movementId);
    setSelectedCategoryId(
      movement?.kind === "TRANSACTION" ? (movement.category?.id ?? "") : ""
    );
    setRuleAction("PRESERVE");
    setRuleKeyInput(existingRule?.merchantKey ?? defaultRuleKey);
    setAssignmentError("");
    setCloseAfterCategoryId(null);
  }
  const normalizedRuleKey = normalizeMerchantRuleKey(ruleKeyInput);
  const ruleUnavailable = defaultRuleKey.length === 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (movement && dialog && !dialog.open) {
      dialog.showModal();
      const frame = requestAnimationFrame(() => closeRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (!movement && dialog?.open) dialog.close();
  }, [movement]);

  useEffect(() => {
    if (!movement || movement.kind !== "TRANSACTION" || busy) return;
    if (assignmentError) {
      saveRef.current?.focus();
      return;
    }
    if (
      closeAfterCategoryId &&
      movement.category?.id === closeAfterCategoryId
    ) {
      dialogRef.current?.close();
    }
  }, [assignmentError, busy, closeAfterCategoryId, movement]);

  if (!movement) return null;
  const firstLeg = movement.legs[0];
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const assignmentUnchanged =
    selectedCategory?.id === movement.category?.id && ruleAction === "PRESERVE";

  function close() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className="transaction-detail-dialog"
      aria-labelledby={`transaction-detail-title-${reactId}`}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
          )
        ].filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !event.currentTarget.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !event.currentTarget.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onClose={() => {
        onClose();
        returnFocus?.focus();
      }}
    >
      <div className="transaction-detail-panel">
        <header className="transaction-detail-heading">
          <div className="transaction-detail-heading-row">
            <span className="eyebrow">Transaction detail</span>
            <button
              ref={closeRef}
              className="transaction-detail-close"
              type="button"
              onClick={close}
            >
              Close <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="transaction-detail-title-row">
            <div>
              <h2 id={`transaction-detail-title-${reactId}`}>
                {movement.description}
              </h2>
              <p className="muted">
                {movement.kind === "TRANSFER"
                  ? movement.legs.map((leg) => leg.account.name).join(" → ")
                  : firstLeg.account.name}
                {" · "}
                {longDate(movement.canonicalDate)}
              </p>
              <p className="transaction-detail-kind">
                {movement.kind === "TRANSFER"
                  ? "One movement · two source transactions"
                  : movement.pending
                    ? "Pending transaction"
                    : "Posted transaction"}
              </p>
            </div>
            <strong className="transaction-detail-amount">
              {amountLabel(movement)}
            </strong>
          </div>
        </header>

        {movement.kind === "TRANSACTION" ? (
          <>
            <details className="transaction-raw-detail" open>
              <summary>Exactly what the bank sent</summary>
              <div>
                <p className="transaction-raw-primary">
                  {available(firstLeg.bankDescription)}
                </p>
                <dl className="movement-metadata">
                  <div>
                    <dt>Plaid description</dt>
                    <dd>{available(firstLeg.name)}</dd>
                  </div>
                  <div>
                    <dt>Merchant</dt>
                    <dd>{available(firstLeg.merchantName)}</dd>
                  </div>
                  <div>
                    <dt>Memo</dt>
                    <dd>{available(firstLeg.paymentMemo)}</dd>
                  </div>
                  <div>
                    <dt>Reference</dt>
                    <dd>{available(firstLeg.referenceNumber)}</dd>
                  </div>
                  <div>
                    <dt>Authorized</dt>
                    <dd>{longDate(firstLeg.authorizedDate)}</dd>
                  </div>
                  <div>
                    <dt>Posted</dt>
                    <dd>{longDate(firstLeg.postedDate)}</dd>
                  </div>
                  <div>
                    <dt>Payment channel</dt>
                    <dd>{available(firstLeg.paymentChannel)}</dd>
                  </div>
                  <div>
                    <dt>Transaction code</dt>
                    <dd>{available(firstLeg.transactionCode)}</dd>
                  </div>
                  <div>
                    <dt>Check number</dt>
                    <dd>{available(firstLeg.checkNumber)}</dd>
                  </div>
                </dl>
                <p className="muted">
                  Read-only. Category changes do not rewrite this source data.
                </p>
              </div>
            </details>

            <section
              className="transaction-user-fields"
              aria-labelledby={`transaction-user-fields-${reactId}`}
            >
              <span
                className="eyebrow"
                id={`transaction-user-fields-${reactId}`}
              >
                Your version
              </span>
              <dl>
                <div>
                  <dt>Display name</dt>
                  <dd>
                    {movement.description}
                    <span>
                      Custom transaction names are not supported by the current
                      API.
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Personal note</dt>
                  <dd>
                    Not available
                    <span>
                      Personal notes are not stored by the current data model.
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="transaction-drawer-category">
                <GroupedCategoryPicker
                  categories={categories}
                  value={selectedCategoryId}
                  onChange={(category) => setSelectedCategoryId(category.id)}
                  label="Category"
                  hint="Grouped in Needs, Flex, Savings, and Debt order."
                />
                <div className="field merchant-rule-action-field">
                  <label htmlFor={`drawer-merchant-rule-action-${reactId}`}>
                    Exact merchant rule
                  </label>
                  <select
                    className="input"
                    id={`drawer-merchant-rule-action-${reactId}`}
                    value={ruleAction}
                    onChange={(event) =>
                      setRuleAction(event.target.value as MerchantRuleAction)
                    }
                  >
                    <option value="PRESERVE">
                      {existingRule
                        ? `Keep existing rule → ${existingRule.category.name}`
                        : "Do not create a rule"}
                    </option>
                    {!ruleUnavailable ? (
                      <option value="UPSERT">
                        {existingRule
                          ? "Retarget existing rule"
                          : "Create exact merchant rule"}
                      </option>
                    ) : null}
                    {existingRule ? (
                      <option value="DELETE">Delete existing rule</option>
                    ) : null}
                  </select>
                  <p className="muted">
                    {ruleAction === "PRESERVE"
                      ? existingRule
                        ? `The existing “${existingRule.merchantKey}” rule stays assigned to ${existingRule.category.name}.`
                        : "Only this transaction will be assigned."
                      : ruleAction === "DELETE"
                        ? `The existing “${existingRule?.merchantKey}” rule will be deleted.`
                        : "The exact key below will be assigned to the selected category."}
                  </p>
                </div>
                <div className="field merchant-rule-key-field">
                  <label htmlFor={`drawer-merchant-rule-${reactId}`}>
                    Exact normalized merchant key
                  </label>
                  <input
                    className="input"
                    id={`drawer-merchant-rule-${reactId}`}
                    type="text"
                    value={ruleKeyInput}
                    readOnly={ruleAction !== "UPSERT" || ruleUnavailable}
                    required={ruleAction === "UPSERT"}
                    maxLength={120}
                    aria-describedby={`drawer-merchant-rule-hint-${reactId}`}
                    onChange={(event) => setRuleKeyInput(event.target.value)}
                    onBlur={() => setRuleKeyInput(normalizedRuleKey)}
                  />
                  <p
                    className="muted"
                    id={`drawer-merchant-rule-hint-${reactId}`}
                  >
                    {ruleUnavailable
                      ? "No usable merchant text is available, so no merchant rule can be created."
                      : ruleAction === "UPSERT"
                        ? `Will save exactly as “${normalizedRuleKey}”.`
                        : ruleAction === "DELETE"
                          ? "The existing exact rule will be deleted."
                          : "The existing exact rule, if any, will be preserved unchanged."}
                  </p>
                </div>
                {assignmentError ? (
                  <p className="review-error" role="alert">
                    {assignmentError}
                  </p>
                ) : null}
                <button
                  ref={saveRef}
                  className="button"
                  type="button"
                  disabled={
                    busy ||
                    !selectedCategory ||
                    assignmentUnchanged ||
                    (ruleAction === "UPSERT" && normalizedRuleKey.length === 0)
                  }
                  onClick={async () => {
                    if (selectedCategory) {
                      setAssignmentError("");
                      const saved = await onAssignCategory(
                        movement,
                        selectedCategory,
                        {
                          ruleAction,
                          merchantKey: normalizedRuleKey,
                          expectedRuleRevision: existingRule?.revision ?? null
                        }
                      );
                      if (!saved) {
                        setAssignmentError(
                          "Category was not saved. Review the error and try again."
                        );
                      } else {
                        setCloseAfterCategoryId(selectedCategory.id);
                      }
                    }
                  }}
                >
                  {busy ? "Saving…" : "Save category"}
                </button>
              </div>
            </section>
          </>
        ) : (
          <div className="transaction-drawer-transfer">
            <TransferDetails
              id={`drawer-transfer-${reactId}`}
              labelledBy={`transaction-detail-title-${reactId}`}
              legs={movement.legs}
              headingLevel={3}
              untieBusy={busy}
              onUntie={() => {
                onUntie(movement);
                close();
              }}
            />
          </div>
        )}
      </div>
    </dialog>
  );
}
