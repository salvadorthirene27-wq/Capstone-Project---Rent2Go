"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup" | "recover" | "reset">(
      "login",
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setMode("signup");
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email")),
      password = String(f.get("password") ?? "");
    try {
      let r;
      if (mode === "signup")
        r = await authClient.signUp.email({
          email,
          password,
          name: String(f.get("name")),
        });
      else if (mode === "recover")
        r = await authClient.emailOtp.requestPasswordReset({ email });
      else if (mode === "reset")
        r = await authClient.emailOtp.resetPassword({
          email,
          otp: String(f.get("otp")),
          password,
        });
      else r = await authClient.signIn.email({ email, password });
      if (r.error)
        throw Error(
          r.error.message || "Unable to continue. Check your details.",
        );
      if (mode === "recover") {
        setMessage(
          "If this account is eligible, a reset code will be emailed. Enter it below.",
        );
        setMode("reset");
      } else if (mode === "reset") {
        setMessage("Password updated. Sign in with your new password.");
        setMode("login");
      } else window.location.href = "/workspace";
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connection failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-form">
      <h2>
        {mode === "signup"
          ? "Create your account"
          : mode === "recover"
            ? "Recover your account"
            : mode === "reset"
              ? "Set a new password"
              : "Welcome back to Rent2Go!"}
      </h2>
      <p>
        {mode === "signup"
          ? "An account lets you save your application. Agency access follows approval."
          : "Enter your details to continue."}
      </p>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Full name
            <input name="name" autoComplete="name" required maxLength={120} />
          </label>
        )}
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
          />
        </label>
        {mode === "reset" && (
          <label>
            Reset code
            <input
              name="otp"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
            />
          </label>
        )}
        {mode !== "recover" && (
          <label>
            {mode === "reset" ? "New password" : "Password"}
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            {mode === "signup" && <small>Use at least 12 characters.</small>}
          </label>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        <button className="button wide" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : mode === "recover"
                ? "Send reset code"
                : mode === "reset"
                  ? "Update password"
                  : "Sign in"}
        </button>
      </form>
      <div className="auth-links">
        <button
          className="link-button"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
          }}
        >
          {mode === "signup"
            ? "Already registered? Sign in"
            : "New here? Create an account"}
        </button>
        <button
          className="link-button"
          onClick={() => {
            setMode(mode === "login" ? "recover" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "Forgot password?" : "Back to sign in"}
        </button>
      </div>
    </section>
  );
}
