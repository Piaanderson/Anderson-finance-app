"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectionState } from "./connection-status";
import { usePlaidConnectionManager } from "./plaid-link-provider";

type BusyAction = "refresh" | "reconnect" | "disconnect" | null;

export function ConnectionControls({
  itemId,
  institution,
  action,
  statusDescriptionId
}: {
  itemId: string;
  institution: string;
  action: ConnectionState["action"];
  statusDescriptionId: string;
}) {
  const router = useRouter();
  const { startLink } = usePlaidConnectionManager();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const queueSync = useCallback(
    async (successMessage: string) => {
      const response = await fetch(`/api/plaid/items/${itemId}`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("sync");
      }
      setStatus(successMessage);
      router.refresh();
    },
    [itemId, router]
  );

  async function refresh(label: string) {
    setBusy("refresh");
    setError("");
    setStatus("");
    try {
      await queueSync(label);
    } catch {
      setError("The sync could not be queued. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function reconnect() {
    setBusy("reconnect");
    setError("");
    setStatus("Preparing secure bank sign-in…");
    try {
      await startLink({
        itemId,
        onSuccess: async () => {
          setError("");
          try {
            await queueSync("Reconnected. A fresh sync is queued.");
          } catch {
            setError(
              "The connection was restored, but its sync could not be queued."
            );
          } finally {
            setBusy(null);
          }
        },
        onExit: (plaidError) => {
          setBusy(null);
          if (plaidError) {
            setError("Bank sign-in closed before the connection was restored.");
          } else {
            setStatus("Reconnect canceled.");
          }
        },
        onUnavailable: () => {
          setBusy(null);
          setStatus("");
          setError("Secure bank sign-in is unavailable. Try again.");
        }
      });
    } catch {
      setBusy(null);
      setStatus("");
      setError("Secure bank sign-in is unavailable. Try again.");
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        `Disconnect ${institution}? Currents will stop syncing its accounts and transactions.`
      )
    ) {
      return;
    }
    setBusy("disconnect");
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/plaid/items/${itemId}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("disconnect");
      setStatus(`${institution} disconnected.`);
      router.refresh();
    } catch {
      setError("The connection could not be disconnected. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="connection-controls">
      <div className="button-row">
        {action === "reconnect" ? (
          <button
            className="button"
            type="button"
            disabled={busy !== null}
            aria-label={`Reconnect ${institution}`}
            aria-describedby={statusDescriptionId}
            onClick={() => void reconnect()}
          >
            {busy === "reconnect" ? "Opening bank sign-in…" : "Reconnect"}
          </button>
        ) : null}
        {action === "refresh" || action === "retry" ? (
          <button
            className="button"
            type="button"
            disabled={busy !== null}
            aria-label={
              action === "retry"
                ? `Try sync again for ${institution}`
                : `Refresh ${institution}`
            }
            aria-describedby={statusDescriptionId}
            onClick={() =>
              void refresh(
                action === "retry"
                  ? "Sync retry queued."
                  : "Account refresh queued."
              )
            }
          >
            {busy === "refresh"
              ? "Queueing…"
              : action === "retry"
                ? "Try sync again"
                : "Refresh"}
          </button>
        ) : null}
        <button
          className="button secondary"
          type="button"
          disabled={busy !== null}
          aria-label={`Disconnect ${institution}`}
          aria-describedby={statusDescriptionId}
          onClick={() => void disconnect()}
        >
          {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
      <p className="status-region muted" role="status" aria-live="polite">
        {status}
      </p>
      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
