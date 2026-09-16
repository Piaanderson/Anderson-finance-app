import type { Metadata } from "next";
import { signIn } from "@/auth";
import { PasskeySignIn } from "@/features/auth/passkey-sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const devEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_DEV_BYPASS === "true";

  return (
    <main className="auth-page">
      <section className="card auth-card" aria-labelledby="sign-in-title">
        <span className="eyebrow">Currents</span>
        <h1 id="sign-in-title">Your money, in motion.</h1>
        <p className="muted">
          Sign in to connect accounts and build a plan around where your money
          actually lives.
        </p>
        <PasskeySignIn />
        {devEnabled ? (
          <form
            action={async (formData) => {
              "use server";
              await signIn("development", {
                email: formData.get("email"),
                redirectTo: "/accounts"
              });
            }}
          >
            <div className="field">
              <label htmlFor="dev-email">Development email</label>
              <input
                className="input"
                id="dev-email"
                name="email"
                type="email"
                defaultValue="owner@currents.local"
                required
              />
            </div>
            <button className="button secondary" type="submit">
              Local development sign-in
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
