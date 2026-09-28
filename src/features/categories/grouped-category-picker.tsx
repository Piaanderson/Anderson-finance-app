"use client";

import { useId, useMemo, useState } from "react";
import { CATEGORY_SECTIONS } from "./category-domain";
import type { CategoryReviewChoice } from "./category-data";

export function GroupedCategoryPicker({
  categories,
  value,
  onChange,
  name,
  label = "Search and choose a category",
  hint,
  error,
  disabled = false,
  initialOpen = false
}: {
  categories: CategoryReviewChoice[];
  value: string;
  onChange: (category: CategoryReviewChoice) => void;
  name?: string;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  initialOpen?: boolean;
}) {
  const reactId = useId().replaceAll(":", "");
  const inputId = `category-picker-${reactId}`;
  const listboxId = `category-picker-listbox-${reactId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(initialOpen);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = categories.find((category) => category.id === value) ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    if (!needle) return categories;
    return categories.filter(
      (category) =>
        category.name.toLocaleLowerCase("en-US").includes(needle) ||
        category.section.toLocaleLowerCase("en-US").includes(needle)
    );
  }, [categories, query]);
  const active = filtered[Math.min(activeIndex, filtered.length - 1)] ?? null;
  const grouped = CATEGORY_SECTIONS.map((section) => ({
    section,
    categories: filtered.filter((category) => category.section === section)
  })).filter((group) => group.categories.length > 0);
  const describedBy =
    [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") ||
    undefined;

  function select(category: CategoryReviewChoice) {
    onChange(category);
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

  return (
    <div className="category-combobox">
      <label htmlFor={inputId}>{label}</label>
      {name ? <input type="hidden" name={name} value={value} /> : null}
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
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        value={query}
        placeholder={
          selected
            ? `${selected.name} · ${selected.section}`
            : "Type a name or group"
        }
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
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
                    }}
                    onClick={() => select(category)}
                    onMouseEnter={() => setActiveIndex(optionIndex)}
                  >
                    <span>{category.name}</span>
                    <span>{isSelected ? "Selected" : category.section}</span>
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
      ) : null}
      {hint ? (
        <p className="muted" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="danger" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
