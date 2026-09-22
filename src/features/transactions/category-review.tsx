"use client";

import { useId, useMemo, useState } from "react";
import { CATEGORY_SECTIONS } from "@/features/categories/category-domain";
import type {
  CategoryReviewChoice,
  MerchantRuleReview
} from "@/features/categories/category-data";
import { merchantRuleKey } from "@/features/categories/merchant-rule";
import { formatMovementAmount } from "@/lib/money";
import type { TransactionMovement } from "./movements";

function movementDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function movementAmount(movement: TransactionMovement) {
  const amount = movement.amounts[0];
  const formatted = formatMovementAmount(amount.value, amount.currency);
  if (movement.direction === "OUTFLOW") return `−${formatted}`;
  if (movement.direction === "INFLOW") return `+${formatted}`;
  return formatted;
}

export function CategoryReview({
  movement,
  categories,
  existingRule,
  queueCount,
  busy,
  onAssign,
  onSkip
}: {
  movement: TransactionMovement;
  categories: CategoryReviewChoice[];
  existingRule: MerchantRuleReview | null;
  queueCount: number;
  busy: boolean;
  onAssign: (category: CategoryReviewChoice, createRule: boolean) => void;
  onSkip: () => void;
}) {
  const reactId = useId().replaceAll(":", "");
  const inputId = `category-combobox-${reactId}`;
  const listboxId = `category-listbox-${reactId}`;
  const headingId = `category-review-${reactId}`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(existingRule?.category.id ?? "");
  const [createRule, setCreateRule] = useState(Boolean(existingRule));
  const ruleKey = merchantRuleKey({
    merchantName: movement.legs[0].merchantName,
    name: movement.legs[0].name
  });
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    if (!needle) return categories;
    return categories.filter(
      (category) =>
        category.name.toLocaleLowerCase("en-US").includes(needle) ||
        category.section.toLocaleLowerCase("en-US").includes(needle)
    );
  }, [categories, query]);
  const selected =
    categories.find((category) => category.id === selectedId) ?? null;
  const active = filtered[Math.min(activeIndex, filtered.length - 1)] ?? null;

  function select(category: CategoryReviewChoice) {
    setSelectedId(category.id);
    setQuery(category.name);
    setOpen(false);
  }

  function moveActive(direction: 1 | -1) {
    if (filtered.length === 0) return;
    setOpen(true);
    setActiveIndex((current) => {
      const next = current + direction;
      if (next < 0) return filtered.length - 1;
      if (next >= filtered.length) return 0;
      return next;
    });
  }

  const grouped = CATEGORY_SECTIONS.map((section) => ({
    section,
    categories: filtered.filter((category) => category.section === section)
  })).filter((group) => group.categories.length > 0);

  return (
    <section
      className="card category-review category-review-active"
      aria-labelledby={headingId}
      data-review-order="categories"
    >
      <div className="review-heading">
        <div>
          <span className="eyebrow">
            Categories second · {queueCount} to review
          </span>
          <h2 id={headingId}>Categories to assign</h2>
        </div>
        <span className="review-status">Choose one category</span>
      </div>

      <div className="category-review-transaction">
        <div>
          <h3>{movement.description}</h3>
          <p className="muted">
            {movement.legs[0].account.name} ·{" "}
            {movementDate(movement.canonicalDate)}
            {movement.pending ? " · Pending" : ""}
          </p>
        </div>
        <strong className="row-amount">{movementAmount(movement)}</strong>
      </div>

      <div className="category-combobox">
        <label htmlFor={inputId}>Search and choose a category</label>
        <input
          className="input"
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && active ? `${listboxId}-option-${active.id}` : undefined
          }
          value={query}
          placeholder="Type a category or section"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedId("");
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActive(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(-1);
            } else if (event.key === "Home" && open) {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End" && open) {
              event.preventDefault();
              setActiveIndex(Math.max(0, filtered.length - 1));
            } else if (event.key === "Enter" && open && active) {
              event.preventDefault();
              select(active);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        {open ? (
          <div
            className="category-listbox"
            id={listboxId}
            role="listbox"
            aria-label="Categories grouped by budget section"
          >
            {grouped.map((group) => (
              <div
                className="category-option-group"
                role="group"
                aria-label={group.section}
                key={group.section}
              >
                <span className="category-group-label" aria-hidden="true">
                  {group.section}
                </span>
                {group.categories.map((category) => {
                  const optionIndex = filtered.findIndex(
                    (entry) => entry.id === category.id
                  );
                  const isActive = active?.id === category.id;
                  const isSelected = selected?.id === category.id;
                  return (
                    <div
                      className="category-option"
                      id={`${listboxId}-option-${category.id}`}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      data-active={isActive || undefined}
                      key={category.id}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        select(category);
                      }}
                      onMouseEnter={() => setActiveIndex(optionIndex)}
                    >
                      <span>{category.name}</span>
                      {isSelected ? <span>Selected</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 ? (
              <p className="category-no-results" role="status">
                No categories match “{query}”.
              </p>
            ) : null}
          </div>
        ) : null}
        {selected ? (
          <p className="category-selection" role="status">
            Selected: {selected.name} · {selected.section}
          </p>
        ) : (
          <p className="muted">Use arrow keys and Enter, or choose by touch.</p>
        )}
      </div>

      <label className="merchant-rule-choice">
        <input
          type="checkbox"
          checked={createRule}
          onChange={(event) => setCreateRule(event.target.checked)}
        />
        <span>
          <strong>Use this category for future exact merchant matches</strong>
          <span>
            Merchant key: “{ruleKey}”.
            {existingRule
              ? ` Existing rule: ${existingRule.category.name}. Uncheck to remove it.`
              : " Optional; leave unchecked for this transaction only."}
          </span>
        </span>
      </label>

      <div className="review-actions">
        <button
          className="button"
          type="button"
          disabled={!selected || busy}
          data-category-primary-action
          onClick={() => {
            if (selected) onAssign(selected, createRule);
          }}
        >
          {busy ? "Assigning…" : "Assign category"}
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
