"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

export default function AuthError() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-100">Loading...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
}

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">Authentication Error</h2>
          <p className="mt-2 text-sm text-red-600">
            {error === "OAuthSignin"
              ? "Error starting the sign in process"
              : error === "OAuthCallback"
              ? "Error completing the sign in process"
              : error === "OAuthCreateAccount"
              ? "Error creating the account"
              : error === "EmailCreateAccount"
              ? "Error creating the account"
              : error === "Callback"
              ? "Error during the callback"
              : error === "OAuthAccountNotLinked"
              ? "Email already exists with different credentials"
              : error === "EmailSignin"
              ? "Error sending the email"
              : error === "CredentialsSignin"
              ? "Invalid credentials"
              : "An error occurred during authentication"}
          </p>
          <div className="mt-4">
            <Link
              href="/login"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Try again
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 