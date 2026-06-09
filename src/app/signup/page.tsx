import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

type SignupPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const errorMessage = params.error;

  async function signup(formData: FormData) {
    "use server";

    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    const supabase = await createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      redirect(`/signup?error=${encodeURIComponent(error.message)}`);
    }

    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Create your Plumber account.</CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <form action={signup} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                id="email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">
                Password
              </label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                id="password"
                name="password"
                required
                type="password"
              />
            </div>

            <Button className="w-full" type="submit">
              Create account
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="font-medium underline" href="/login">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
