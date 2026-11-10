import Link from "next/link";
import { AuthForm } from "./auth-form";
import "./auth-design.css";

const photos = [
  ["pickup", "pickup"],
  ["cagsawa", "cagsawa"],
  ["tucson", "tucson"],
  ["night-suv", "night-suv"],
  ["sports-complex", "sports-complex"],
  ["night-house", "night-house"],
] as const;

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { mode } = await searchParams;
  return (
    <main id="main-content" className="figma-auth">
      <div className="figma-auth-columns">
        <aside className="figma-auth-brand">
          <Link href="/" className="figma-auth-logo" aria-label="Rent2Go home">Rent2Go</Link>
          <div className="figma-auth-collage" aria-hidden="true">
            {photos.map(([slot, photo]) => (
              <div key={slot} className={`figma-auth-photo figma-auth-photo-${slot}`}>
                <img src={`/figma/auth/${photo}.png`} alt="" />
              </div>
            ))}
          </div>
          <p className="figma-auth-tagline">
            <span>Explore</span>
            <span>freely.</span>
            <span>Your trip,</span>
            <span>your ride.</span>
          </p>
          <img className="figma-auth-divider" src="/figma/auth/vertical-rule.svg" alt="" />
        </aside>
        <AuthForm initialMode={mode === "signup" || mode === "recover" ? mode : "login"} />
      </div>
      <footer className="figma-auth-footer">
        <img className="figma-auth-footer-line" src="/figma/auth/horizontal-rule.svg" alt="" />
        <span>© 2026 Rent2Go. Fast. Easy. Reliable.</span>
        <Link href="/account-status">Account & privacy</Link>
        <Link href="/terms">Terms &amp; Conditions</Link>
        <Link href="/help">Contact Us</Link>
      </footer>
    </main>
  );
}
