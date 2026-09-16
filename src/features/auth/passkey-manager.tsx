"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";

type Credential = {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

type OptionsEnvelope = {
  ceremonyId: string;
  options: Parameters<typeof startRegistration>[0]["optionsJSON"];
};

export function PasskeyManager({
  credentials,
  unusedRecoveryCodeCount
}: {
  credentials: Credential[];
  unusedRecoveryCodeCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function addPasskey(formData: FormData) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const credentialName = String(formData.get("credentialName") ?? "");
      const optionsResponse = await fetch(
        "/api/passkeys/registration/options",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "user", credentialName })
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
            mode: "user",
            ceremonyId: envelope.ceremonyId,
            response
          })
        }
      );
      if (!verificationResponse.ok) throw new Error("verification");
      setStatus("Passkey added.");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === "NotAllowedError"
          ? "Passkey creation was canceled or timed out."
          : "The passkey could not be added."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: string, name: string) {
    if (!window.confirm(`Remove ${name}? This passkey will stop working.`)) {
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(`/api/passkeys/credentials/${id}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "The passkey could not be removed.");
    } else {
      setStatus("Passkey removed.");
      router.refresh();
    }
    setBusy(false);
  }

  async function regenerateRecoveryCodes() {
    if (
      !window.confirm(
        "Generate new recovery codes? Every previously saved code will stop working."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    const response = await fetch("/api/passkeys/recovery/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    if (!response.ok) {
      setError("Recovery codes could not be regenerated.");
    } else {
      const result = (await response.json()) as { recoveryCodes: string[] };
      setRecoveryCodes(result.recoveryCodes);
      setStatus("New recovery codes generated.");
      router.refresh();
    }
    setBusy(false);
  }

  async function copyRecoveryCodes() {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setStatus("Recovery codes copied.");
  }

  return (
    <div className="security-grid">
      <section className="card" aria-labelledby="passkeys-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Authentication</span>
            <h2 id="passkeys-title">Passkeys</h2>
          </div>
          <span className="muted">{credentials.length} active</span>
        </div>
        <ul className="credential-list">
          {credentials.map((credential, index) => {
            const name = credential.name || `Passkey ${index + 1}`;
            return (
              <li key={credential.id}>
                <div>
                  <strong>{name}</strong>
                  <p className="muted">
                    {credential.backedUp ? "Synced passkey" : "Device passkey"}{" "}
                    · Added{" "}
                    {new Date(credential.createdAt).toLocaleDateString()}
                    {credential.lastUsedAt
                      ? ` · Last used ${new Date(credential.lastUsedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => removePasskey(credential.id, name)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="inline-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void addPasskey(new FormData(event.currentTarget));
          }}
        >
          <div className="field">
            <label htmlFor="new-passkey-name">New passkey name</label>
            <input
              className="input"
              id="new-passkey-name"
              name="credentialName"
              placeholder="Phone, laptop, security key…"
              required
            />
          </div>
          <button className="button" type="submit" disabled={busy}>
            Add passkey
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="recovery-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Fallback</span>
            <h2 id="recovery-title">Recovery codes</h2>
          </div>
          <span className="muted">{unusedRecoveryCodeCount} unused</span>
        </div>
        <p className="muted">
          Keep these offline. A code grants one sign-in and is consumed
          immediately.
        </p>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={regenerateRecoveryCodes}
        >
          Generate new recovery codes
        </button>
        {recoveryCodes.length > 0 ? (
          <>
            <ol className="recovery-codes" aria-label="New recovery codes">
              {recoveryCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ol>
            <button
              className="button secondary"
              type="button"
              onClick={copyRecoveryCodes}
            >
              Copy recovery codes
            </button>
          </>
        ) : null}
      </section>

      <div aria-live="polite" className="status-region">
        {status ? <p className="positive">{status}</p> : null}
        {error ? (
          <p className="danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
