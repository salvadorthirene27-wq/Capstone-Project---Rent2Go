import { AuthForm } from "./auth-form";
export default function Login() {
  return (
    <main id="main-content" className="auth-page">
      <aside>
        <span className="wordmark">Rent2Go.</span>
        <h1>
          A place for your
          <br />
          next chapter.
        </h1>
        <p>
          Manage agency applications, vehicle partnerships and your workspace.
        </p>
      </aside>
      <AuthForm />
    </main>
  );
}
