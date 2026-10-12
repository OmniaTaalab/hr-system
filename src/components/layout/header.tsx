"use client";

import { useRouter } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings, LogOut, User, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useUserProfile } from "./app-layout";
import { Skeleton } from "../ui/skeleton";
import { Notifications } from "./notifications";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";

export function Header() {
  const router = useRouter();
  const { user, profile, loading } = useUserProfile();
  const { t, isRTL } = useI18n();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const displayName = profile?.name || user?.displayName;
  const photoURL = profile?.photoURL || user?.photoURL;
  const role = profile?.role?.trim().toLowerCase();

  const canViewSettings =
    role === "admin" ||
    role === "hr" ||
    role === "human resource director" ||
    role === "human resource director international schools" ||
    role === "personnal director" ||
    role === "recruitment and onbording manager" ||
    role === "human resource executive" ||
    role === "recruitment and onboarding executive" ||
    role === "personnel executive";

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between sm:justify-end px-4 sm:px-8">
        <div className="md:hidden">
          <SidebarTrigger />
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Global Language Switcher */}
          <LanguageSwitcher variant="header" />

          {/* Notifications */}
          <Notifications />

          {loading ? (
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-20 hidden sm:block" />
            </div>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 px-2 py-1 h-auto"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={photoURL || undefined}
                      alt={displayName || ""}
                    />
                    <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline max-w-[140px] truncate">
                    {displayName || "User"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isRTL ? "start" : "end"} className="w-48">
                <DropdownMenuLabel>
                  {t("header.my_account", "My Account")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                    <User className="h-4 w-4" />
                    <span>{t("header.profile", "Profile")}</span>
                  </Link>
                </DropdownMenuItem>
                {canViewSettings && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                      <Settings className="h-4 w-4" />
                      <span>{t("header.settings", "Settings")}</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className={isRTL ? "ml-2 h-4 w-4" : "mr-2 h-4 w-4"} />
                  <span>{t("header.logout", "Log out")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">{t("auth.sign_in", "Login")}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
