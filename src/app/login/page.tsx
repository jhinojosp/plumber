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

export default function LoginPage() {
  async function login(formData: FormData) {
    "use server";

    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      redirect("/login?error=Could not authenticate user");
    }

    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Access your Plumber dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login} className="space-y-4">
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
              Log in
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            No account yet?{" "}
            <Link className="font-medium underline" href="/signup">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
