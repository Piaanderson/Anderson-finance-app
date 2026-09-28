"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { usePlaidConnectionManager } from "./plaid-link-provider";

export function ConnectAccountButton() {
  const router = useRouter();
  const { startLink } = usePlaidConnectionManager();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true);
    setError("");
    setStatus("Preparing secure bank connection…");
    try {
      await startLink({
        onSuccess: async (
          publicToken: string | null,
          metadata: PlaidLinkOnSuccessMetadata
        ) => {
          if (!publicToken) {
            setStatus("");
            setError("Plaid did not return a connection token.");
            setBusy(false);
            return;
          }
          setStatus("Saving your connection…");
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
            setStatus("Connected. Accounts are syncing now.");
            router.refresh();
          } catch {
            setStatus("");
            setError("The connection could not be saved.");
          } finally {
            setBusy(false);
          }
        },
        onExit: (error) => {
          setBusy(false);
          if (error) {
            setStatus("");
            setError("Connection closed before it was completed.");
          } else {
            setStatus("Connection canceled.");
          }
        },
        onUnavailable: () => {
          setBusy(false);
          setStatus("");
          setError("Secure bank connection is unavailable. Try again.");
        }
      });
    } catch {
      setBusy(false);
      setStatus("");
      setError("Bank connection is not configured yet.");
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
        {status}
      </span>
      {error ? (
        <span className="danger" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
