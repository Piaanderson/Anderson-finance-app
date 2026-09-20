"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { usePlaidConnectionManager } from "./plaid-link-provider";

export function ConnectAccountButton() {
  const router = useRouter();
  const { startLink } = usePlaidConnectionManager();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function connect() {
    setBusy(true);
    setMessage("Preparing secure bank connection…");
    try {
      await startLink({
        onSuccess: async (
          publicToken: string | null,
          metadata: PlaidLinkOnSuccessMetadata
        ) => {
          if (!publicToken) {
            setMessage("Plaid did not return a connection token.");
            setBusy(false);
            return;
          }
          setMessage("Saving your connection…");
          try {
            const response = await fetch("/api/plaid/exchange", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                publicToken,
                institutionId: metadata.institution?.institution_id,
                institutionName: metadata.institution?.name
              })
            });
            if (!response.ok) throw new Error("exchange");
            setMessage("Connected. Accounts are syncing now.");
            router.refresh();
          } catch {
            setMessage("The connection could not be saved.");
          } finally {
            setBusy(false);
          }
        },
        onExit: (error) => {
          setBusy(false);
          setMessage(
            error
              ? "Connection closed before it was completed."
              : "Connection canceled."
          );
        },
        onUnavailable: () => {
          setBusy(false);
          setMessage("Secure bank connection is unavailable. Try again.");
        }
      });
    } catch {
      setBusy(false);
      setMessage("Bank connection is not configured yet.");
    }
  }

  return (
    <>
      <button
        className="button"
        type="button"
        onClick={() => void connect()}
        disabled={busy}
      >
        {busy ? "Opening Plaid…" : "Connect account"}
      </button>
      <span role="status" className="muted status-region" aria-live="polite">
        {message}
      </span>
    </>
  );
}
