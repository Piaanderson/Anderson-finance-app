"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";

type OptionsEnvelope = {
  ceremonyId: string;
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
};

export function PasskeySignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function authenticate() {
    setBusy(true);
    setError("");
    try {
      const optionsResponse = await fetch(
        "/api/passkeys/authentication/options",
        { method: "POST" }
      );
      if (!optionsResponse.ok) throw new Error("options");
      const envelope = (await optionsResponse.json()) as OptionsEnvelope;
      const response = await startAuthentication({
        optionsJSON: envelope.options
      });
      const result = await signIn("passkey", {
        ceremonyId: envelope.ceremonyId,
        response: JSON.stringify(response),
        redirect: false
      });
      if (!result?.ok) throw new Error("verification");
      router.push("/accounts");
      router.refresh();
    } catch (reason) {
      if (reason instanceof Error && reason.name === "NotAllowedError") {
        setError("Passkey sign-in was canceled or timed out.");
      } else {
        setError("We couldn’t verify that passkey. Please try again.");
      }
      setBusy(false);
    }
  }

  async function recover(formData: FormData) {
    setBusy(true);
    setError("");
    const result = await signIn("recovery-code", {
      code: formData.get("recoveryCode"),
      redirect: false
    });
    if (result?.ok) {
      router.push("/settings/security");
      router.refresh();
      return;
    }
    setError("That recovery code is invalid or has already been used.");
    setBusy(false);
  }

  return (
    <div className="auth-actions">
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={authenticate}
      >
        {busy ? "Waiting for your passkey…" : "Sign in with a passkey"}
      </button>

      <details>
        <summary>Use a recovery code</summary>
        <form
          className="stack"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void recover(new FormData(event.currentTarget));
          }}
        >
          <div className="field">
            <label htmlFor="recovery-code">One-time recovery code</label>
            <input
              className="input"
              id="recovery-code"
              name="recoveryCode"
              type="password"
              autoComplete="one-time-code"
              spellCheck={false}
              required
              aria-describedby="recovery-help"
            />
            <p className="muted" id="recovery-help">
              Each saved recovery code can be used only once.
            </p>
          </div>
          <button className="button secondary" type="submit" disabled={busy}>
            Sign in with recovery code
          </button>
        </form>
      </details>

      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}

      <p className="muted">
        Setting up Currents for the first time?{" "}
        <Link href="/setup">Create the owner account</Link>.
      </p>
    </div>
  );
}
