
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom"; // Corrected import for useFormStatus
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUser, type LoginState } from "@/app/actions/auth-actions";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { ArrowRight, LogInIcon } from "lucide-react";
import { Icons } from "@/components/icons"; // Import the Icons component

const initialState: LoginState = { message: null, errors: {} };

function LoginButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full group" aria-disabled={pending} disabled={pending}>
      {pending ? "Signing In..." : "Sign In"}
      <LogInIcon className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Button>
  );
}

export default function LoginPage() {
  const [state, dispatch] = useActionState(loginUser, initialState);
  const { toast } = useToast();

  useEffect(() => {
    if (state?.errors?.form && state.errors.form.length > 0) {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: state.errors.form.join(", "),
      });
    }
  }, [state, toast]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 selection:bg-primary/20">
      <div className="mb-8">
        <Icons.Logo className="h-20 w-20" />
      </div>
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold font-headline">Sign In</CardTitle>
          <CardDescription>Enter your credentials to access your account.</CardDescription>
        </CardHeader>
        <form action={dispatch}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="user@example.com"
                aria-describedby="email-error"
              />
              {state?.errors?.email && (
                <p id="email-error" className="text-sm font-medium text-destructive">
                  {state.errors.email.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                aria-describedby="password-error"
              />
              {state?.errors?.password && (
                <p id="password-error" className="text-sm font-medium text-destructive">
                  {state.errors.password.join(", ")}
                </p>
              )}
            </div>
             {state?.errors?.form && state.errors.form.length > 0 && (
              <p className="text-sm font-medium text-destructive text-center">
                {state.errors.form.join(", ")}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <LoginButton />
             <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="#" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
       <Button variant="link" asChild className="mt-8 text-muted-foreground hover:text-primary">
        <Link href="/">
           Back to Dashboard
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

