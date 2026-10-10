"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { appNavigationLinks, mobileQuickLinks } from "./navigation-links";

export function MobileNavigation() {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, [pathname]);

  function openMenu() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function closeMenu() {
    dialogRef.current?.close();
  }

  return (
    <>
      <header className="mobile-header">
        <Link
          className="mobile-brand"
          href="/dashboard"
          aria-label="Currents home"
        >
          <span className="brand-mark" aria-hidden="true" />
          <span>Currents</span>
        </Link>
        <button
          ref={triggerRef}
          className="mobile-menu-trigger"
          type="button"
          aria-expanded={isOpen}
          aria-controls="mobile-navigation-drawer"
          aria-label="Open navigation menu"
          onClick={openMenu}
        >
          <span className="mobile-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </header>

      <nav className="mobile-bottom-navigation" aria-label="Primary">
        <ul className="mobile-quick-links">
          {mobileQuickLinks.map((link) => (
            <li key={link.href}>
              <Link
                className="nav-link"
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <dialog
        ref={dialogRef}
        className="mobile-navigation-dialog"
        id="mobile-navigation-drawer"
        aria-labelledby="mobile-navigation-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
        onClose={() => {
          setIsOpen(false);
          triggerRef.current?.focus();
        }}
      >
        <div className="mobile-navigation-panel">
          <div className="mobile-navigation-heading">
            <div>
              <span className="eyebrow">Currents</span>
              <h2 id="mobile-navigation-title">Navigation</h2>
            </div>
            <button
              className="mobile-menu-close"
              type="button"
              aria-label="Close navigation menu"
              onClick={closeMenu}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <nav aria-label="All destinations">
            <ul className="drawer-nav-list">
              {appNavigationLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    className="nav-link"
                    href={link.href}
                    aria-current={pathname === link.href ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </>
  );
}
