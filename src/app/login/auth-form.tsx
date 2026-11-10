"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { onboardingPaths, parseOnboardingPath, type OnboardingPath } from "@/modules/account/onboarding";

type EntryMode = "login" | "signup" | "recover";
type Mode = EntryMode | "signup-details" | "reset-code" | "reset" | "updated";

const headings: Record<Mode, string> = {
  login: "Welcome back to Rent2Go!",
  signup: "WELCOME TO Rent2Go!",
  "signup-details": "Finish registration",
  recover: "Forgot password?",
  "reset-code": "Enter code",
  reset: "Set new password",
  updated: "Password updated",
};

const roles = [
  ["agency", "Car Rental Agency"],
  ["cosigner", onboardingPaths.cosigner.label],
  ["renter", "Customer"],
] as const satisfies ReadonlyArray<readonly [OnboardingPath, string]>;

export function AuthForm({ initialMode }: { initialMode?: EntryMode }) {
  const [mode, setMode] = useState<Mode>(initialMode ?? "login");
  const [email, setEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [wait, setWait] = useState(0);
  const [code, setCode] = useState("");
  const [role, setRole] = useState<OnboardingPath>();
  const [rolesOpen, setRolesOpen] = useState(false);
  const roleButton = useRef<HTMLButtonElement>(null);
  const signupDraft = useRef<{email: string; password: string; onboarding: OnboardingPath} | null>(null);
  const [formRevision, setFormRevision] = useState(0);
  const active = useRef(true);
  const pending = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const verifiedCode = useRef("");
  const createdAccount = useRef<{ email: string; onboarding: OnboardingPath } | null>(null);

  useEffect(() => {
    active.current = true;
    if (!initialMode) {
      const queryMode = new URLSearchParams(window.location.search).get("mode");
      if (queryMode === "signup" || queryMode === "recover") setMode(queryMode);
    }
    return () => { active.current = false; };
  }, [initialMode]);

  useEffect(() => { if (error || message) feedback.current?.focus(); }, [error, message]);
  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  function change(next: Mode) {
    if (pending.current) return;
    verifiedCode.current = "";
    signupDraft.current = null;
    setRolesOpen(false);
    setCode("");
    setMode(next);
    setError("");
    setMessage("");
    setVisible(false);
    if (next !== "reset" && next !== "reset-code") setRecoveryEmail("");
  }

  async function requestCode(target: string) {
    verifiedCode.current = "";
    setCode("");
    const result = await authClient.emailOtp.requestPasswordReset({ email: target });
    if (result.error) throw Error("Unable to request a reset code right now. Wait and try again.");
    if (!active.current) return;
    setRecoveryEmail(target);
    setMode("reset-code");
    setVisible(false);
    setMessage("If this account is eligible, a reset code will be emailed. Check your Inbox and Spam.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    const form = event.currentTarget;
    const values = new FormData(form);
    const target = (mode === "reset-code" || mode === "reset" ? recoveryEmail : email).trim();
    const password = mode === "signup-details" ? signupDraft.current?.password ?? "" : String(values.get("password") ?? "");
    let resetSubmitted = false;

    try {
      if (mode === "recover") {
        if (wait) throw Error("Wait before requesting another reset code.");
        setWait(60);
        await requestCode(target);
        return;
      }
      if (mode === "reset-code") {
        const otp = String(values.get("otp") ?? "");
        if (!/^\d{6}$/.test(otp)) throw Error("Enter the six-digit reset code from your email.");
        const result = await authClient.emailOtp.checkVerificationOtp({ email: target, otp, type: "forget-password" });
        if (result.error || !result.data?.success) {
          throw Error("Unable to verify this reset code. Check the code, or request a new one if it has expired.");
        }
        if (!active.current) return;
        verifiedCode.current = otp;
        setCode("");
        setMode("reset");
        setVisible(false);
        return;
      }
      if (mode === "signup") {
        if (password.length < 12 || password.length > 128) throw Error("Use a password with 12 to 128 characters.");
        const onboarding = parseOnboardingPath(role);
        if (!onboarding) throw Error("Choose a role to continue.");
        signupDraft.current = { email: target, password, onboarding };
        setRolesOpen(false);
        setVisible(false);
        setMode("signup-details");
        return;
      }
      if (mode === "signup-details" || mode === "reset") {
        if (password.length < 12 || password.length > 128) throw Error("Use a password with 12 to 128 characters.");
        if (password !== values.get("confirmPassword")) throw Error("The passwords do not match.");
      }
      if (mode === "signup-details") {
        const draft = signupDraft.current;
        if (!draft) { setMode("signup"); throw Error("Enter your registration details again."); }
        const name = String(values.get("name") ?? "").trim();
        if (name.length < 2) throw Error("Enter your full name.");
        const {email: signupEmail, onboarding} = draft;
        const result = await authClient.signUp.email({ email: signupEmail, password, name });
        if (result.error) {
          throw Error("Unable to create the account. Check your details, or sign in or recover an existing account.");
        }
        if (!active.current) return;
        signupDraft.current = null;
        if (result.data?.token) {
          window.location.assign(`/workspace/account?onboarding=${onboarding}`);
        } else {
          createdAccount.current = { email: signupEmail.toLowerCase(), onboarding };
          setMode("login");
          setVisible(false);
          setMessage("Your account is created. Sign in to open Account & security and verify your email.");
        }
        return;
      }
      if (mode === "reset") {
        const otp = verifiedCode.current;
        if (!/^\d{6}$/.test(otp)) {
          setMode("reset-code");
          throw Error("Verify your reset code before choosing a new password.");
        }
        resetSubmitted = true;
        const result = await authClient.emailOtp.resetPassword({ email: target, otp, password });
        if (String(result.error?.code) === "PASSWORD_REUSE") {
          resetSubmitted = false;
          setFormRevision(value => value + 1);
          setVisible(false);
          throw Error("Choose a new password different from your current password.");
        }
        if (result.error) {
          throw Error("Unable to update the password. Verify your code again, or request a new code if it has expired.");
        }
        if (!active.current) return;
        verifiedCode.current = "";
        setEmail(target);
        setRecoveryEmail("");
        setVisible(false);
        setMode("updated");
        return;
      }

      const result = await authClient.signIn.email({ email: target, password });
      if (result.error) throw Error("Unable to sign in. Check your email and password, or recover your account.");
      if (active.current) {
        const signup = createdAccount.current;
        window.location.assign(signup?.email === target.toLowerCase()
          ? `/workspace/account?onboarding=${signup.onboarding}`
          : "/workspace/start");
      }
    } catch (cause) {
      if (active.current) {
        if (resetSubmitted) {
          verifiedCode.current = "";
          setCode("");
          setMode("reset-code");
          setVisible(false);
        }
        setError(cause instanceof Error ? cause.message : "Connection failed. Try again.");
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function resend() {
    if (pending.current || wait || !recoveryEmail) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setWait(60);
    if (mode === "reset") setMode("reset-code");
    try {
      await requestCode(recoveryEmail);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : "Unable to request a reset code.");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const usesPassword = mode === "login" || mode === "signup" || mode === "reset";
  const resendLabel = wait ? `Request another code in ${wait}s` : "Request another reset code";

  return (
    <section className={`figma-auth-panel figma-auth-panel-${mode}`} aria-labelledby="auth-heading">
      {mode !== "signup" && (mode === "login"
        ? <Link className="figma-auth-back" href="/"><BackArrow />Back</Link>
        : <button className="figma-auth-back" type="button" disabled={busy}
            onClick={() => change(mode === "signup-details" ? "signup" : mode === "reset" ? "reset-code" : mode === "reset-code" ? "recover" : "login")}>
            <BackArrow />Back
          </button>)}
      <div className="figma-auth-content">
        {mode === "updated" && (
          <div className="figma-auth-check" aria-hidden="true">
            <img src="/figma/auth/password-check-background.svg" alt="" />
            <img src="/figma/auth/password-check.png" alt="" />
          </div>
        )}
        <h1 id="auth-heading" className={mode === "login" ? "sr-only" : undefined}>{headings[mode]}</h1>
        {mode === "signup" && <p className="figma-auth-intro">
          Choose <strong>Car Rental Agency</strong> to apply as a partner, <strong>Cosigner</strong> to offer a vehicle, or <strong>Customer</strong> to explore and book services.
        </p>}
        {mode === "signup-details" && <p className="figma-auth-intro">Enter your name and confirm your password to create your {roles.find(([value]) => value === role)?.[1]} account.</p>}
        {mode === "recover" && <p className="figma-auth-intro">Enter your account email to receive a code.</p>}
        {mode === "reset-code" && <p className="figma-auth-intro">Sent to <strong>{recoveryEmail}</strong></p>}
        {mode === "reset" && <p className="figma-auth-intro">Use 12 to 128 characters and choose a different password.</p>}
        {mode === "updated" ? (
          <>
            <p className="figma-auth-intro" role="status">Your account password has been safely reset. Existing sessions have been signed out.</p>
            <button className="figma-auth-primary" type="button" onClick={() => change("login")}>Log In</button>
          </>
        ) : (
          <form key={`${mode}:${formRevision}`} onSubmit={submit}>
            <fieldset disabled={busy} className="figma-auth-fields">
              <legend className="sr-only">{headings[mode]}</legend>
              {mode === "signup-details" && (
                <label className="figma-auth-field">Full name
                  <input name="name" placeholder="Full name" autoComplete="name" required minLength={2} maxLength={120} />
                </label>
              )}
              {mode !== "reset" && mode !== "signup-details" && (
                <label className={mode === "reset-code" ? "sr-only" : "figma-auth-field"}>
                  <span className={mode === "signup" ? undefined : "sr-only"}>Email address</span>
                  <input name="email" type="email" placeholder="Email address" autoComplete="email"
                    required maxLength={200} value={mode === "reset-code" ? recoveryEmail : email}
                    readOnly={mode === "reset-code"} tabIndex={mode === "reset-code" ? -1 : undefined}
                    onChange={event => setEmail(event.target.value)} />
                </label>
              )}
              {mode === "reset-code" && (
                <>
                  <label className="figma-auth-otp">
                    <span className="sr-only">Reset code</span>
                    <input name="otp" required autoComplete="one-time-code" inputMode="numeric"
                      pattern="[0-9]{6}" minLength={6} maxLength={6} value={code}
                      onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
                    <span className="figma-auth-code-cells" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => <span key={index}>{code[index] ?? ""}</span>)}
                    </span>
                  </label>
                  <div className="figma-auth-resend">
                    <span>{wait ? `Resend in ${wait}s` : "Need another code?"}</span>
                    <button type="button" aria-label={resendLabel} disabled={wait > 0} onClick={() => void resend()}>Resend</button>
                  </div>
                </>
              )}
              {usesPassword && (
                <div className="figma-auth-field">
                  <label htmlFor="auth-password" className={mode === "signup" ? undefined : "sr-only"}>{mode === "reset" ? "New password" : "Password"}</label>
                  <div className="auth-password-control">
                    <input id="auth-password" name="password" placeholder={mode === "reset" ? "Create new password" : "Password"}
                      type={visible ? "text" : "password"} minLength={mode === "login" ? 1 : 12}
                      maxLength={128} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
                    <button type="button" className="password-visibility" aria-label={visible ? "Hide password" : "Show password"}
                      aria-pressed={visible} aria-controls="auth-password" onClick={() => setVisible(value => !value)}>
                      {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              )}
              {(mode === "signup-details" || mode === "reset") && (
                <label className="figma-auth-field">
                  <span className={mode === "signup-details" ? undefined : "sr-only"}>Confirm new password</span>
                  <input name="confirmPassword" placeholder="Confirm new password" type={visible ? "text" : "password"}
                    autoComplete="new-password" minLength={12} maxLength={128} required />
                </label>
              )}
              {mode === "signup" && (
                <div className="figma-auth-role figma-auth-field"
                  onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setRolesOpen(false); }}
                  onKeyDown={event => { if (event.key === "Escape" && rolesOpen) { setRolesOpen(false); roleButton.current?.focus(); } }}>
                  <span id="auth-role-label">Role</span>
                  <button type="button" className="figma-auth-role-trigger" ref={roleButton}
                    aria-labelledby="auth-role-label auth-role-value" aria-expanded={rolesOpen}
                    aria-controls={rolesOpen ? "auth-roles" : undefined} onClick={() => setRolesOpen(open => !open)}>
                    <span id="auth-role-value">{roles.find(([value]) => value === role)?.[1]}</span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </button>
                  {rolesOpen && <div id="auth-roles" className="figma-auth-role-options" role="group" aria-labelledby="auth-role-label">
                    {roles.map(([value,label]) => <button type="button" key={value} aria-pressed={role === value} onClick={() => {
                      setRole(value); setRolesOpen(false); roleButton.current?.focus();
                    }}>{label}</button>)}
                  </div>}
                </div>
              )}
              {(error || message) && (
                <p ref={feedback} tabIndex={-1} className={error ? "error-box" : "notice"} role={error ? "alert" : "status"}>
                  {error || message}
                </p>
              )}
              <button className="figma-auth-primary" disabled={busy || (mode === "recover" && wait > 0)}>
                {busy ? "Please wait…" : mode === "signup" ? "Register" : mode === "signup-details" ? "Create account" : mode === "recover"
                  ? (wait ? `Request another code in ${wait}s` : "Send Code") : mode === "reset-code"
                    ? "Verify Code" : mode === "reset" ? "Reset Password" : "Login"}
              </button>
            </fieldset>
          </form>
        )}
        <div className="figma-auth-actions">
          {mode === "login" && <>
            <button type="button" disabled={busy} onClick={() => change("recover")}>Forgot password?</button>
            <button type="button" className="figma-auth-secondary" disabled={busy} onClick={() => change("signup")}>Register new account</button>
          </>}
          {mode === "recover" && <button type="button" disabled={busy} onClick={() => change("login")}>Back to Login</button>}
          {(mode === "reset-code" || mode === "reset") && <button type="button" disabled={busy} onClick={() => change("recover")}>Change contact detail</button>}
          {mode === "reset" && <>
            <button type="button" disabled={busy} onClick={() => change("reset-code")}>Use a different reset code</button>
            <button type="button" disabled={busy || wait > 0} onClick={() => void resend()}>{resendLabel}</button>
          </>}
        </div>
      </div>
      <div className="figma-auth-panel-footer">
        {mode === "signup" || mode === "signup-details" ? <>Already have an account? <button type="button" disabled={busy} onClick={() => change("login")}>Login</button></>
          : mode === "login" ? <>Don’t have an account? <button type="button" disabled={busy} onClick={() => change("signup")}>Register</button></>
            : <>Need help? <Link href="/help">Support</Link></>}
      </div>
    </section>
  );
}

function BackArrow() {
  return <img src="/figma/auth/back-arrow.png" width="14" height="14" alt="" />;
}
