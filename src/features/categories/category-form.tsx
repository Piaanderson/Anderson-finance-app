"use client";

import { useActionState } from "react";
import {
  createCategory,
  type CategoryFormState
} from "@/features/categories/actions";

const initialState: CategoryFormState = {};

export function CategoryForm() {
  const [state, action, pending] = useActionState(createCategory, initialState);
  const invalid = Boolean(state.error);

  return (
    <form className="card" action={action} aria-labelledby="new-category-title">
      <h2 id="new-category-title">Create category</h2>
      <div className="field">
        <label htmlFor="category-name">Category name</label>
        <input
          className="input"
          id="category-name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "category-error" : undefined}
        />
      </div>
      <div className="field">
        <label htmlFor="category-section">Budget section</label>
        <select className="input" id="category-section" name="section">
          <option>Needs</option>
          <option>Flex</option>
          <option>Savings</option>
          <option>Debt</option>
        </select>
      </div>
      {state.error ? (
        <p className="danger" id="category-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="positive" role="status">
          {state.success}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add category"}
      </button>
    </form>
  );
}
