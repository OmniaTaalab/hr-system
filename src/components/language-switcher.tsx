"use client";

import React from "react";
import { useI18n, Language } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  variant?: "header" | "pill" | "dropdown" | "minimal";
  className?: string;
}

export function LanguageSwitcher({
  variant = "header",
  className,
}: LanguageSwitcherProps) {
  const { lang, setLang, toggleLang, isRTL } = useI18n();

  // Variant 1: Header Segmented Pill (Super intuitive, 1-click switch)
  if (variant === "header") {
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-full border border-border/80 bg-background/80 p-0.5 shadow-xs backdrop-blur-xs transition-all",
          className
        )}
        role="group"
        aria-label="Language selection"
      >
        <button
          type="button"
          onClick={() => setLang("en")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
            lang === "en"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
          title="Switch to English"
        >
          <span className="text-[11px] tracking-wider uppercase">EN</span>
        </button>

        <button
          type="button"
          onClick={() => setLang("ar")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all font-arabic",
            lang === "ar"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
          title="التحويل إلى اللغة العربية"
        >
          <span className="text-[12px]">عربي</span>
        </button>
      </div>
    );
  }

  // Variant 2: Minimal Toggle Button (Globe + Target Language)
  if (variant === "minimal") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleLang}
        className={cn("h-8 gap-1.5 px-2 text-xs font-medium", className)}
        title={lang === "en" ? "التحويل للعربية" : "Switch to English"}
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={lang === "ar" ? "font-sans" : "font-arabic"}>
          {lang === "en" ? "عربي" : "EN"}
        </span>
      </Button>
    );
  }

  // Variant 3: Dropdown Menu with Globe
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-1.5 px-2.5 text-xs font-medium", className)}
        >
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{lang === "en" ? "English" : "العربية"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRTL ? "start" : "end"} className="w-36">
        <DropdownMenuItem
          onClick={() => setLang("en")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className={lang === "en" ? "font-semibold" : ""}>English</span>
          {lang === "en" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLang("ar")}
          className="flex items-center justify-between cursor-pointer font-arabic"
        >
          <span className={lang === "ar" ? "font-semibold" : ""}>العربية</span>
          {lang === "ar" && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSwitcher;
