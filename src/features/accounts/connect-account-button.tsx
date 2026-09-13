"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata
} from "react-plaid-link";

export function ConnectAccountButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/plaid/link-token", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Connection is unavailable.");
        return (await response.json()) as { linkToken: string };
      })
      .then((data) => setLinkToken(data.linkToken))
      .catch(() => setMessage("Bank connection is not configured yet."));
  }, []);

  const onSuccess = useCallback(
    async (
      publicToken: string | null,
      metadata: PlaidLinkOnSuccessMetadata
    ) => {
      if (!publicToken) {
        setMessage("Plaid did not return a connection token.");
        return;
      }
      setMessage("Saving your connection…");
      const response = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicToken,
          institutionId: metadata.institution?.institution_id,
          institutionName: metadata.institution?.name
        })
      });
      setMessage(
        response.ok
          ? "Connected. Accounts are syncing now."
          : "The connection could not be saved."
      );
      if (response.ok) router.refresh();
    },
    [router]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (error) => {
      if (error) setMessage("Connection closed before it was completed.");
    }
  });

  return (
    <>
      <button
        className="button"
        type="button"
        onClick={() => open()}
        disabled={!ready}
      >
        Connect account
      </button>
      <span role="status" className="muted">
        {message}
      </span>
    </>
  );
}
