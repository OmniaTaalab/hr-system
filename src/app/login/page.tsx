
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
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function LoginPage() {
  const { t, isRTL } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  const isFirebaseConfigured = Object.values(auth.app.options).every(
    (value) => typeof value !== "string" || !value.includes("REPLACE_WITH")
  );

  useEffect(() => {
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
    if (user?.email) {
      const loginEmail = user.email.toLowerCase().trim();
      
      // Fetch all employees to perform case-insensitive comparison
      const employeeSnapshot = await getDocs(collection(db, "employee"));
      const matchedEmployee = employeeSnapshot.docs.find(doc => {
        const data = doc.data();
        const nisEmail = (data.nisEmail || "").toLowerCase().trim();
        return nisEmail === loginEmail;
      });

      if (matchedEmployee) {
        if (!matchedEmployee.data().userId) {
          await updateDoc(doc(db, "employee", matchedEmployee.id), {
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
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: configError,
      });
      setIsGoogleLoading(false);
      return;
    }

    const provider = new GoogleAuthProvider();

    try {
      console.log("🚀 Starting Google Sign-In...");
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log("✅ Google Sign-In success:", user?.email, user);

      if (user?.email) {
        const googleEmail = user.email.toLowerCase().trim();
        console.log("🔍 Checking Firestore for email (case-insensitive):", googleEmail);

        // Fetch all employees to perform case-insensitive comparison
        const allEmployeesSnapshot = await getDocs(collection(db, "employee"));
        const matchedEmployee = allEmployeesSnapshot.docs.find(doc => {
          const data = doc.data();
          const nisEmail = (data.nisEmail || "").toLowerCase().trim();
          const emailField = (data.email || "").toLowerCase().trim();
          return nisEmail === googleEmail || emailField === googleEmail;
        });

        if (matchedEmployee) {
          const employeeDoc = matchedEmployee;
          console.log("✅ Found employee doc:", employeeDoc.id, employeeDoc.data());

          if (!employeeDoc.data().userId) {
            await updateDoc(doc(db, "employee", employeeDoc.id), {
              userId: user.uid,
            });
            console.log("🔗 Linked userId to employee:", user.uid);
            toast({
              title: "Account Linked",
              description:
                "Your Google account has been linked to your employee profile.",
            });
          }

          console.log("➡️ Redirecting to dashboard...");
          router.push("/");
        } else {
          console.warn("❌ No employee found in Firestore for:", googleEmail);
          toast({
            variant: "destructive",
            title: "Access Denied",
            description: "You are not registered as an employee.",
          });
          await signOut(auth);
        }
      } else {
        console.error("🚫 Could not retrieve user email from Google Sign-In!");
      }
    } catch (error: any) {
      console.error("🔥 Google Sign-In error:", error);
      let errorMessage = "An unexpected error occurred during Google Sign-In.";
      if (error.code) {
        switch (error.code) {
          case "auth/popup-blocked":
            errorMessage =
              "Sign-in pop-up was blocked by the browser. Please allow pop-ups for this site and try again.";
            break;
          case "auth/account-exists-with-different-credential":
            console.warn("⚠️ Account exists with different credential:", error);
            const email = error.customData.email;
            if (email) {
              const lowerCaseEmail = email.toLowerCase().trim();
              const methods = await fetchSignInMethodsForEmail(auth, lowerCaseEmail);
              console.log("🔁 Sign-in methods for", lowerCaseEmail, ":", methods);
              if (methods.includes(GoogleAuthProvider.PROVIDER_ID)) {
                errorMessage =
                  "This Google account is already associated with a user.";
              } else if (methods.includes("password")) {
                try {
                  const password = prompt(
                    "An account with this email already exists. Please enter your password to link your Google account:"
                  );
                  if (password) {
                    const userCredential = await signInWithEmailAndPassword(
                      auth,
                      lowerCaseEmail,
                      password
                    );
                    const credential =
                      GoogleAuthProvider.credentialFromError(error);
                    if (userCredential.user && credential) {
                      console.log("🔗 Linking Google credential to existing user...");
                      await linkWithCredential(userCredential.user, credential);
                      await handleAuthSuccess(userCredential.user);
                      toast({
                        title: "Accounts Linked",
                        description:
                          "Your Google account has been successfully linked to your existing profile.",
                      });
                      router.push("/");
                      return;
                    }
                  } else {
                    errorMessage =
                      "Password not provided. Account linking cancelled.";
                  }
                } catch (linkError: any) {
                  console.error("❌ Failed to link accounts:", linkError);
                  errorMessage = `Failed to link accounts: ${linkError.message}`;
                }
              }
            } else {
              errorMessage =
                "An account already exists with this email address. Please sign in using the original method.";
            }
            break;
          case "auth/popup-closed-by-user":
            errorMessage =
              "Sign-in cancelled. The pop-up window was closed before completing the sign-in process.";
            break;
          case "auth/cancelled-popup-request":
            errorMessage =
              "Sign-in cancelled. Multiple pop-up requests were made.";
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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background p-4 selection:bg-primary/20">
      {/* Top right language switcher */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <LanguageSwitcher variant="header" />
      </div>

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
            {t("auth.sign_in", "Sign In")}
          </CardTitle>
          <CardDescription>
            {t("auth.welcome_subtitle", "Enter your credentials to access your account.")}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || !isFirebaseConfigured}
            >
              {isGoogleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.Logo className="h-4 w-4" />
              )}
              {t("auth.sign_in_google", "Sign in with Google")}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {t("auth.or_continue_with", "Or continue with")}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email", "Email")}</Label>
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
              <Label htmlFor="password">{t("auth.password", "Password")}</Label>
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
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("auth.signing_in", "Signing In...")}
                </>
              ) : (
                <>
                  {t("auth.sign_in_email", "Sign In with Email")}
                  <LogInIcon className={isRTL ? "mr-2 h-4 w-4 rotate-180" : "ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"} />
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
