"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { maintainCategoryAction, type CategoryFormState } from "./actions";
import type {
  CategoryMaintenanceCategory,
  MerchantRuleMaintenance
} from "./category-data";
import { CATEGORY_SECTIONS } from "./category-domain";
import { GroupedCategoryPicker } from "./grouped-category-picker";
import { normalizeMerchantRuleKey } from "./merchant-rule";

const initialState: CategoryFormState = {};

function Feedback({ state }: { state: CategoryFormState }) {
  return (
    <>
      {state.error && !state.fieldErrors ? (
        <p className="review-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="positive" role="status" aria-live="polite">
          {state.success}
        </p>
      ) : null}
    </>
  );
}

function HiddenCategoryRevision({
  category,
  listRevision
}: {
  category: CategoryMaintenanceCategory;
  listRevision: string;
}) {
  return (
    <>
      <input type="hidden" name="categoryId" value={category.id} />
      <input
        type="hidden"
        name="expectedCategoryRevision"
        value={category.revision}
      />
      <input type="hidden" name="expectedListRevision" value={listRevision} />
    </>
  );
}

function dependencyText(category: CategoryMaintenanceCategory) {
  const { transactions, rules, allocations } = category.dependencies;
  return `${transactions} transaction${transactions === 1 ? "" : "s"} · ${rules} rule${rules === 1 ? "" : "s"} · ${allocations} budget allocation${allocations === 1 ? "" : "s"}`;
}

function CreateCategoryForm({ listRevision }: { listRevision: string }) {
  const [state, action, pending] = useActionState(
    maintainCategoryAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) nameRef.current?.focus();
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      className="card category-create-form"
      action={action}
      noValidate
      aria-labelledby="new-category-title"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="expectedListRevision" value={listRevision} />
      <div>
        <span className="eyebrow">New classification</span>
        <h2 id="new-category-title">Create category</h2>
      </div>
      <div className="category-form-grid">
        <div className="field">
          <label htmlFor="category-name">Category name</label>
          <input
            ref={nameRef}
            className="input"
            id="category-name"
            name="name"
            required
            minLength={2}
            maxLength={60}
            aria-invalid={state.fieldErrors?.name ? "true" : undefined}
            aria-describedby={
              state.fieldErrors?.name ? "category-name-error" : undefined
            }
          />
          {state.fieldErrors?.name ? (
            <p className="danger" id="category-name-error" role="alert">
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="category-section">Budget group</label>
          <select
            className="input"
            id="category-section"
            name="section"
            required
          >
            {CATEGORY_SECTIONS.map((section) => (
              <option key={section}>{section}</option>
            ))}
          </select>
        </div>
      </div>
      <Feedback state={state} />
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add category"}
      </button>
    </form>
  );
}

function CategoryCard({
  category,
  listRevision,
  activeCategories,
  first,
  last
}: {
  category: CategoryMaintenanceCategory;
  listRevision: string;
  activeCategories: CategoryMaintenanceCategory[];
  first: boolean;
  last: boolean;
}) {
  const [state, action, pending] = useActionState(
    maintainCategoryAction,
    initialState
  );
  const [mergeTargetId, setMergeTargetId] = useState("");
  const cardRef = useRef<HTMLLIElement>(null);
  const reactId = useId().replaceAll(":", "");
  const archived = category.archivedAt !== null;
  const mergeChoices = activeCategories.filter(
    (choice) => choice.id !== category.id
  );
  const mergeTarget = activeCategories.find(
    (choice) => choice.id === mergeTargetId
  );

  useEffect(() => {
    if (!state.error) return;
    cardRef.current
      ?.querySelector<HTMLElement>(
        '[aria-invalid="true"], input:not([type="hidden"]), select, button'
      )
      ?.focus();
  }, [state]);

  return (
    <li
      ref={cardRef}
      className="category-maintenance-row"
      data-category-id={category.id}
    >
      <div className="category-row-heading">
        <div>
          <h3>{category.name}</h3>
          <p className="muted">{dependencyText(category)}</p>
        </div>
        <span className={archived ? "warning" : "positive"}>
          {archived ? "Archived" : "Active"}
        </span>
      </div>

      {archived ? (
        <form className="category-inline-actions" action={action}>
          <input type="hidden" name="intent" value="restore" />
          <HiddenCategoryRevision
            category={category}
            listRevision={listRevision}
          />
          <p className="muted">
            Historical transactions and allocations remain linked. Preserved
            merchant rules are paused until restore.
          </p>
          <button className="button secondary" type="submit" disabled={pending}>
            {pending ? "Restoring…" : `Restore ${category.name}`}
          </button>
        </form>
      ) : (
        <>
          <form className="category-rename-form" action={action} noValidate>
            <input type="hidden" name="intent" value="rename" />
            <HiddenCategoryRevision
              category={category}
              listRevision={listRevision}
            />
            <div className="field">
              <label htmlFor={`category-rename-${reactId}`}>
                Category name
              </label>
              <input
                className="input"
                id={`category-rename-${reactId}`}
                name="name"
                defaultValue={category.name}
                required
                minLength={2}
                maxLength={60}
                aria-invalid={state.fieldErrors?.name ? "true" : undefined}
                aria-describedby={
                  state.fieldErrors?.name
                    ? `category-rename-error-${reactId}`
                    : undefined
                }
              />
              {state.fieldErrors?.name ? (
                <p
                  className="danger"
                  id={`category-rename-error-${reactId}`}
                  role="alert"
                >
                  {state.fieldErrors.name}
                </p>
              ) : null}
            </div>
            <button
              className="button secondary"
              type="submit"
              disabled={pending}
            >
              Save name
            </button>
          </form>

          <div
            className="category-order-controls"
            aria-label={`Reorder ${category.name}`}
          >
            <form action={action}>
              <input type="hidden" name="intent" value="reorder" />
              <input type="hidden" name="direction" value="up" />
              <HiddenCategoryRevision
                category={category}
                listRevision={listRevision}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={pending || first}
              >
                Move up
              </button>
            </form>
            <form action={action}>
              <input type="hidden" name="intent" value="reorder" />
              <input type="hidden" name="direction" value="down" />
              <HiddenCategoryRevision
                category={category}
                listRevision={listRevision}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={pending || last}
              >
                Move down
              </button>
            </form>
            <form className="category-move-form" action={action}>
              <input type="hidden" name="intent" value="move" />
              <HiddenCategoryRevision
                category={category}
                listRevision={listRevision}
              />
              <label htmlFor={`category-move-${reactId}`}>Move to group</label>
              <select
                className="input"
                id={`category-move-${reactId}`}
                name="section"
                defaultValue={category.section}
                aria-invalid={state.fieldErrors?.section ? "true" : undefined}
                aria-describedby={
                  state.fieldErrors?.section
                    ? `category-move-error-${reactId}`
                    : undefined
                }
              >
                {CATEGORY_SECTIONS.map((section) => (
                  <option key={section}>{section}</option>
                ))}
              </select>
              {state.fieldErrors?.section ? (
                <p
                  className="danger"
                  id={`category-move-error-${reactId}`}
                  role="alert"
                >
                  {state.fieldErrors.section}
                </p>
              ) : null}
              <button
                className="button secondary"
                type="submit"
                disabled={pending}
              >
                Move group
              </button>
            </form>
          </div>

          <details className="category-danger-zone">
            <summary>Archive or merge</summary>
            <div>
              <form
                action={action}
                onSubmit={(event) => {
                  if (
                    !window.confirm(
                      `Archive ${category.name}? Existing transactions and budget allocations will stay linked, and merchant rules will pause.`
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="archive" />
                <HiddenCategoryRevision
                  category={category}
                  listRevision={listRevision}
                />
                <p className="muted">
                  Archive only hides this category from new assignments.
                  Existing financial records are not rewritten.
                </p>
                <button
                  className="button secondary"
                  type="submit"
                  disabled={pending}
                >
                  Archive category
                </button>
              </form>
              <form
                className="category-merge-form"
                action={action}
                onSubmit={(event) => {
                  if (
                    !mergeTarget ||
                    !window.confirm(
                      `Merge ${category.name} into ${mergeTarget.name}? This explicitly moves its transaction, rule, and budget references, then archives ${category.name}.`
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="merge" />
                <HiddenCategoryRevision
                  category={category}
                  listRevision={listRevision}
                />
                <input
                  type="hidden"
                  name="expectedTargetRevision"
                  value={mergeTarget?.revision ?? ""}
                />
                <GroupedCategoryPicker
                  categories={mergeChoices}
                  value={mergeTargetId}
                  onChange={(target) => setMergeTargetId(target.id)}
                  name="targetCategoryId"
                  label="Merge into active category"
                  hint="Search all active groups. Merge is explicit and cannot be undone automatically."
                  error={state.fieldErrors?.targetCategoryId}
                />
                <p className="muted">
                  Same-month plans are added with exact Decimal arithmetic.
                  Different destination accounts block the merge instead of
                  being guessed.
                </p>
                <button
                  className="button danger-button"
                  type="submit"
                  disabled={pending || !mergeTarget}
                >
                  Merge and archive
                </button>
              </form>
            </div>
          </details>
        </>
      )}
      <Feedback state={state} />
    </li>
  );
}

function CreateMerchantRuleForm({
  categories
}: {
  categories: CategoryMaintenanceCategory[];
}) {
  const [state, action, pending] = useActionState(
    maintainCategoryAction,
    initialState
  );
  const [categoryId, setCategoryId] = useState("");
  const [merchantKey, setMerchantKey] = useState("");
  const normalized = normalizeMerchantRuleKey(merchantKey);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.error) return;
    formRef.current
      ?.querySelector<HTMLElement>(
        '[aria-invalid="true"], input:not([type="hidden"]), [role="combobox"]'
      )
      ?.focus();
  }, [state]);

  return (
    <form
      ref={formRef}
      className="card merchant-rule-form"
      action={action}
      noValidate
    >
      <input type="hidden" name="intent" value="createRule" />
      <div>
        <span className="eyebrow">Deterministic automation</span>
        <h2>Add merchant rule</h2>
      </div>
      <div className="field">
        <label htmlFor="new-merchant-rule-key">
          Exact normalized merchant key
        </label>
        <input
          className="input"
          id="new-merchant-rule-key"
          name="merchantKey"
          required
          maxLength={120}
          value={merchantKey}
          aria-invalid={state.fieldErrors?.merchantKey ? "true" : undefined}
          aria-describedby={`new-merchant-rule-hint${state.fieldErrors?.merchantKey ? " new-merchant-rule-error" : ""}`}
          onChange={(event) => setMerchantKey(event.target.value)}
          onBlur={() => setMerchantKey(normalized)}
        />
        <p className="muted" id="new-merchant-rule-hint">
          {normalized
            ? `Will save exactly as “${normalized}”.`
            : "Rules match one normalized key exactly. Fuzzy matching is never used."}
        </p>
        {state.fieldErrors?.merchantKey ? (
          <p className="danger" id="new-merchant-rule-error" role="alert">
            {state.fieldErrors.merchantKey}
          </p>
        ) : null}
      </div>
      <GroupedCategoryPicker
        categories={categories}
        value={categoryId}
        onChange={(category) => setCategoryId(category.id)}
        name="targetCategoryId"
        error={state.fieldErrors?.targetCategoryId}
        hint="Choose the active destination category."
      />
      <Feedback state={state} />
      <button
        className="button"
        type="submit"
        disabled={pending || !categoryId || !normalized}
      >
        {pending ? "Adding…" : "Add merchant rule"}
      </button>
    </form>
  );
}

function MerchantRuleCard({
  rule,
  categories
}: {
  rule: MerchantRuleMaintenance;
  categories: CategoryMaintenanceCategory[];
}) {
  const [state, action, pending] = useActionState(
    maintainCategoryAction,
    initialState
  );
  const [categoryId, setCategoryId] = useState(
    rule.category.archived ? "" : rule.category.id
  );
  const [merchantKey, setMerchantKey] = useState(rule.merchantKey);
  const normalized = normalizeMerchantRuleKey(merchantKey);
  const reactId = useId().replaceAll(":", "");
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!state.error) return;
    rowRef.current
      ?.querySelector<HTMLElement>(
        '[aria-invalid="true"], input:not([type="hidden"]), [role="combobox"]'
      )
      ?.focus();
  }, [state]);

  return (
    <li className="merchant-rule-row" ref={rowRef}>
      <form className="merchant-rule-edit-form" action={action} noValidate>
        <input type="hidden" name="intent" value="updateRule" />
        <input type="hidden" name="ruleId" value={rule.id} />
        <input
          type="hidden"
          name="expectedRuleRevision"
          value={rule.revision}
        />
        <div className="field">
          <label htmlFor={`merchant-rule-${reactId}`}>
            Exact normalized merchant key
          </label>
          <input
            className="input"
            id={`merchant-rule-${reactId}`}
            name="merchantKey"
            required
            maxLength={120}
            value={merchantKey}
            aria-invalid={state.fieldErrors?.merchantKey ? "true" : undefined}
            aria-describedby={
              state.fieldErrors?.merchantKey
                ? `merchant-rule-error-${reactId}`
                : undefined
            }
            onChange={(event) => setMerchantKey(event.target.value)}
            onBlur={() => setMerchantKey(normalized)}
          />
          <p className="muted">Saved exact key: “{rule.merchantKey}”.</p>
          {state.fieldErrors?.merchantKey ? (
            <p
              className="danger"
              id={`merchant-rule-error-${reactId}`}
              role="alert"
            >
              {state.fieldErrors.merchantKey}
            </p>
          ) : null}
        </div>
        {rule.category.archived ? (
          <p className="review-warning">
            Paused because {rule.category.name} is archived. Choose an active
            category to reactivate this rule, restore the category, or delete
            the rule.
          </p>
        ) : null}
        <GroupedCategoryPicker
          categories={categories}
          value={categoryId}
          onChange={(category) => setCategoryId(category.id)}
          name="targetCategoryId"
          label="Rule destination category"
          error={state.fieldErrors?.targetCategoryId}
          hint={
            rule.category.archived
              ? `Current archived destination: ${rule.category.name} · ${rule.category.section}.`
              : "Search by category name or product group."
          }
        />
        <div className="category-inline-actions">
          <button
            className="button secondary"
            type="submit"
            disabled={pending || !categoryId || !normalized}
          >
            {pending ? "Saving…" : "Save rule"}
          </button>
        </div>
      </form>
      <form
        className="merchant-rule-delete-form"
        action={action}
        onSubmit={(event) => {
          if (!window.confirm(`Delete exact rule “${rule.merchantKey}”?`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="deleteRule" />
        <input type="hidden" name="ruleId" value={rule.id} />
        <input
          type="hidden"
          name="expectedRuleRevision"
          value={rule.revision}
        />
        <button className="button secondary" type="submit" disabled={pending}>
          Delete rule
        </button>
      </form>
      <Feedback state={state} />
    </li>
  );
}

export function CategoryMaintenanceWorkspace({
  categories,
  activeChoices,
  rules,
  listRevision,
  invalidLegacyCategoryCount
}: {
  categories: CategoryMaintenanceCategory[];
  activeChoices: CategoryMaintenanceCategory[];
  rules: MerchantRuleMaintenance[];
  listRevision: string;
  invalidLegacyCategoryCount: number;
}) {
  const archived = categories.filter((category) => category.archivedAt);

  return (
    <div className="category-maintenance">
      <section className="card category-maintenance-intro">
        <span className="eyebrow">Household classification</span>
        <h2>Maintain the structure without losing history</h2>
        <p className="muted">
          Rename, move, and reorder change the current taxonomy. Archive keeps
          every transaction and budget link. Merge is the only action that
          explicitly migrates those references.
        </p>
      </section>

      <CreateCategoryForm listRevision={listRevision} />

      {invalidLegacyCategoryCount > 0 ? (
        <p className="review-warning" role="status">
          {invalidLegacyCategoryCount} legacy{" "}
          {invalidLegacyCategoryCount === 1 ? "category is" : "categories are"}{" "}
          unavailable here because the stored group is not Needs, Flex, Savings,
          or Debt. Existing records remain preserved.
        </p>
      ) : null}

      <div className="category-groups">
        {CATEGORY_SECTIONS.map((section) => {
          const rows = categories.filter(
            (category) => category.section === section
          );
          const activeRows = rows.filter((category) => !category.archivedAt);
          return (
            <section
              className="card category-group-card"
              aria-labelledby={`category-group-${section.toLowerCase()}`}
              key={section}
            >
              <div className="section-heading">
                <h2 id={`category-group-${section.toLowerCase()}`}>
                  {section}
                </h2>
                <span className="muted">{activeRows.length} active</span>
              </div>
              {rows.length ? (
                <ol className="category-maintenance-list">
                  {rows.map((category) => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      listRevision={listRevision}
                      activeCategories={activeChoices}
                      first={
                        category.archivedAt !== null ||
                        activeRows[0]?.id === category.id
                      }
                      last={
                        category.archivedAt !== null ||
                        activeRows.at(-1)?.id === category.id
                      }
                    />
                  ))}
                </ol>
              ) : (
                <p className="muted">No active categories in this group.</p>
              )}
            </section>
          );
        })}
      </div>

      <section
        className="card category-archive-card"
        aria-labelledby="archive-title"
      >
        <div className="section-heading">
          <h2 id="archive-title">Archived categories</h2>
          <span className="muted">{archived.length} archived</span>
        </div>
        {archived.length ? (
          <ul className="category-maintenance-list">
            {archived.map((category) => (
              <li className="category-archive-summary" key={category.id}>
                <strong>{category.name}</strong>
                <span className="muted">
                  {category.section} · {dependencyText(category)} · restore in
                  its group above
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No archived categories.</p>
        )}
      </section>

      <CreateMerchantRuleForm categories={activeChoices} />

      <section
        className="card merchant-rules-card"
        aria-labelledby="rules-title"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">Exact automation only</span>
            <h2 id="rules-title">Merchant rules</h2>
          </div>
          <span className="muted">{rules.length} rules</span>
        </div>
        <p className="muted">
          Every rule shows its exact normalized key and destination. No hidden
          fuzzy matching or substring behavior is applied.
        </p>
        {rules.length ? (
          <ul className="merchant-rule-list">
            {rules.map((rule) => (
              <MerchantRuleCard
                key={rule.id}
                rule={rule}
                categories={activeChoices}
              />
            ))}
          </ul>
        ) : (
          <p className="muted">No merchant rules yet.</p>
        )}
      </section>
    </div>
  );
}
