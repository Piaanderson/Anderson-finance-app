"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { startRegistration } from "@simplewebauthn/browser";

type OptionsEnvelope = {
  ceremonyId: string;
  options: Parameters<typeof startRegistration>[0]["optionsJSON"];
};

type VerificationResult = {
  recoveryCodes: string[];
};

export function OwnerSetup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  async function register(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const bootstrapToken = String(formData.get("bootstrapToken") ?? "");
      const optionsResponse = await fetch(
        "/api/passkeys/registration/options",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "bootstrap",
            bootstrapToken,
            name: formData.get("name"),
            email: formData.get("email") || undefined,
            credentialName: formData.get("credentialName") || undefined
          })
        }
      );
      if (!optionsResponse.ok) throw new Error("options");
      const envelope = (await optionsResponse.json()) as OptionsEnvelope;
      const response = await startRegistration({
        optionsJSON: envelope.options
      });
      const verificationResponse = await fetch(
        "/api/passkeys/registration/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "bootstrap",
            ceremonyId: envelope.ceremonyId,
            bootstrapToken,
            response
          })
        }
      );
      if (!verificationResponse.ok) throw new Error("verification");
      const result = (await verificationResponse.json()) as VerificationResult;
      setRecoveryCodes(result.recoveryCodes);
    } catch (reason) {
      if (reason instanceof Error && reason.name === "NotAllowedError") {
        setError("Passkey creation was canceled or timed out.");
      } else {
        setError(
          "Owner setup could not be completed. Check the setup code and try again."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes() {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
  }

  if (recoveryCodes.length > 0) {
    return (
      <section className="card recovery-card" aria-labelledby="recovery-title">
        <h2 id="recovery-title">Save your recovery codes</h2>
        <p>
          Store these somewhere secure. Each code works once, and they will not
          be shown again.
        </p>
        <ol className="recovery-codes" aria-label="One-time recovery codes">
          {recoveryCodes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ol>
        <div className="button-row">
          <button
            className="button secondary"
            type="button"
            onClick={copyCodes}
          >
            Copy recovery codes
          </button>
          <Link className="button" href="/sign-in">
            Continue to sign in
          </Link>
        </div>
        <p role="status" className="positive">
          {copied ? "Recovery codes copied." : "Owner account created."}
        </p>
      </section>
    );
  }

  return (
    <form
      className="stack"
      aria-describedby="setup-help"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void register(new FormData(event.currentTarget));
      }}
    >
      <p className="muted" id="setup-help">
        Create the only initial owner account. Your passkey stays on your device
        or password manager.
      </p>
      <div className="field">
        <label htmlFor="owner-name">Your name</label>
        <input
          className="input"
          id="owner-name"
          name="name"
          autoComplete="name"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="owner-email">Email address (optional label)</label>
        <input
          className="input"
          id="owner-email"
          name="email"
          type="email"
          autoComplete="email"
        />
      </div>
      <div className="field">
        <label htmlFor="credential-name">Passkey name</label>
        <input
          className="input"
          id="credential-name"
          name="credentialName"
          defaultValue="Primary passkey"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="bootstrap-token">One-time setup code</label>
        <input
          className="input"
          id="bootstrap-token"
          name="bootstrapToken"
          type="password"
          autoComplete="off"
          required
        />
      </div>
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Creating passkey…" : "Create owner passkey"}
      </button>
      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
