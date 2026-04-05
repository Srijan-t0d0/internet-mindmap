"use client";

import { authClient } from "../lib/auth-client";

/**
 * Tiny client component — the only part of LoginPage that needs browser JS.
 * Extracted so the rest of LoginPage can be a zero-JS Server Component.
 */
export default function SignInButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={className}
      onClick={() =>
        authClient.signIn.social({ provider: "google", callbackURL: "/" })
      }
    >
      {children}
    </button>
  );
}
