
"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { ArrowRight, LogInIcon, Loader2, AlertTriangle } from "lucide-react";
import { Icons } from "@/components/icons";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  fetchSignInMethodsForEmail,
  linkWithCredential,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  limit,
} from "firebase/firestore";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  // A more robust check to see if any of the values are still placeholders
  const isFirebaseConfigured = Object.values(auth.app.options).every(
    (value) => typeof value !== "string" || !value.includes("REPLACE_WITH")
  );

  useEffect(() => {
    // Only check auth state if firebase seems configured
    if (isFirebaseConfigured) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          router.push("/");
        } else {
          setIsCheckingAuth(false);
        }
      });
      return () => unsubscribe();
    } else {
      setIsCheckingAuth(false);
    }
  }, [router, isFirebaseConfigured]);

  const handleAuthSuccess = async (user: any) => {
    // After any successful login, check if the user's email exists in the employee collection
    // and if the employee record is missing a userId.
    if (user?.email) {
      const q = query(
        collection(db, "employee"),
        where("email", "==", user.email),
        limit(1)
      );
      const employeeSnapshot = await getDocs(q);

      if (!employeeSnapshot.empty) {
        const employeeDoc = employeeSnapshot.docs[0];
        // If employee exists but doesn't have a userId, link them.
        if (!employeeDoc.data().userId) {
          await updateDoc(doc(db, "employee", employeeDoc.id), {
            userId: user.uid,
          });
          toast({
            title: "Account Linked",
            description:
              "Your login has been successfully linked to your employee profile.",
          });
        }
      }
    }
    router.push("/");
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!isFirebaseConfigured) {
      const configError =
        "Firebase is not configured correctly. Please check all keys in your config file.";
      setError(configError);
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: configError,
      });
      setIsLoading(false);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      await handleAuthSuccess(userCredential.user);
    } catch (err: any) {
      let errorMessage = "An unexpected error occurred.";
      if (err.code) {
        switch (err.code) {
          case "auth/invalid-credential":
            errorMessage = "Invalid email or password. Please try again.";
            break;
          case "auth/invalid-email":
            errorMessage = "Invalid email address format.";
            break;
          case "auth/too-many-requests":
            errorMessage =
              "Too many login attempts. Please try again later.";
            break;
          case "auth/user-disabled":
            errorMessage = "This user account has been disabled.";
            break;
          default:
            errorMessage = `Login failed. An unexpected error occurred.`;
            break;
        }
      }
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    if (!isFirebaseConfigured) {
      const configError = "Firebase is not configured correctly.";
      setError(configError);
      toast({ variant: "destructive", title: "Configuration Error", description: configError });
      setIsGoogleLoading(false);
      return;
    }

    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      if (user?.email) {
        const workEmailQuery = query(collection(db, "employee"), where("email", "==", user.email), limit(1));
        const personalEmailQuery = query(collection(db, "employee"), where("personalEmail", "==", user.email), limit(1));
        
        const [workEmailSnapshot, personalEmailSnapshot] = await Promise.all([
          getDocs(workEmailQuery),
          getDocs(personalEmailQuery)
        ]);

        const employeeSnapshot = !workEmailSnapshot.empty ? workEmailSnapshot : personalEmailSnapshot;
        
        if (!employeeSnapshot.empty) {
          const employeeDoc = employeeSnapshot.docs[0];
          // Employee found, update their record with the Firebase Auth UID if it's missing
          if (!employeeDoc.data().userId) {
            await updateDoc(doc(db, "employee", employeeDoc.id), {
              userId: user.uid,
            });
             toast({
              title: "Account Linked",
              description: "Your Google account is now linked to your employee profile.",
            });
          }
          router.push("/"); // Redirect to dashboard on successful login
        } else {
          // Employee not found, show error and sign out
          toast({
            variant: "destructive",
            title: "Access Denied",
            description: "You are not registered as an employee.",
          });
          await signOut(auth);
        }
      } else {
          throw new Error("Could not retrieve user email from Google Sign-In.");
      }
    } catch (error: any) {
      let errorMessage = "An unexpected error occurred during Google Sign-In.";
      if (error.code) {
         switch (error.code) {
          case 'auth/popup-blocked':
            errorMessage = 'Sign-in pop-up was blocked by the browser. Please allow pop-ups for this site and try again.';
            break;
          case 'auth/account-exists-with-different-credential':
            const email = error.customData.email;
            if (email) {
                const methods = await fetchSignInMethodsForEmail(auth, email);
                if (methods.includes(GoogleAuthProvider.PROVIDER_ID)) {
                    errorMessage = "This Google account is already associated with a user.";
                } else if (methods.includes('password')) {
                    try {
                        const password = prompt("An account with this email already exists. Please enter your password to link your Google account:");
                        if (password) {
                            const userCredential = await signInWithEmailAndPassword(auth, email, password);
                            const credential = GoogleAuthProvider.credentialFromError(error);
                            if (userCredential.user && credential) {
                                await linkWithCredential(userCredential.user, credential);
                                await handleAuthSuccess(userCredential.user);
                                return; // Exit function on success
                            }
                        } else {
                           errorMessage = "Password not provided. Account linking cancelled.";
                        }
                    } catch (linkError: any) {
                        errorMessage = `Failed to link accounts: ${linkError.message}`;
                    }
                }
            } else {
              errorMessage = 'An account already exists with this email address. Please sign in using the original method.';
            }
            break;
          case 'auth/popup-closed-by-user':
              errorMessage = 'Sign-in cancelled. The pop-up window was closed before completing the sign-in process.';
              break;
          case 'auth/cancelled-popup-request':
              errorMessage = 'Sign-in cancelled. Multiple pop-up requests were made.';
              break;
          default:
            errorMessage = `Google Sign-In failed: ${error.message}`;
            break;
         }
      }
      setError(errorMessage);
       toast({
        variant: "destructive",
        title: "Google Sign-In Failed",
        description: errorMessage,
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (isCheckingAuth && isFirebaseConfigured) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Icons.NisLogo className="h-20 w-20" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 selection:bg-primary/20">
      <div className="mb-8">
        <Icons.NisLogo className="h-20 w-20" />
      </div>

      {!isFirebaseConfigured && (
        <Alert variant="destructive" className="w-full max-w-sm mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Configuration Required</AlertTitle>
          <AlertDescription>
            One or more of your Firebase keys are missing or still have
            placeholder values (e.g., "REPLACE_WITH..."). Please ensure all keys
            like `apiKey`, `messagingSenderId`, and `appId` are copied
            correctly from your Firebase project settings into:
            <br />
            <code className="mt-2 block font-mono text-xs bg-muted p-1 rounded">
              src/lib/firebase/config.ts
            </code>
            <br />
            The app will not work until this is done.
          </AlertDescription>
        </Alert>
      )}

      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold font-headline">
            Sign In
          </CardTitle>
          <CardDescription>
            Enter your credentials to access your account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || !isFirebaseConfigured}
            >
              {isGoogleLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.Logo className="mr-2 h-4 w-4" />
              )}
              Sign in with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!isFirebaseConfigured}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={!isFirebaseConfigured}
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-destructive text-center">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <Button
              type="submit"
              className="w-full group"
              disabled={isLoading || !isFirebaseConfigured}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  Sign In with Email
                  <LogInIcon className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
      <Button
        variant="link"
        asChild
        className="mt-8 text-muted-foreground hover:text-primary"
      ></Button>
    </div>
  );
}

    