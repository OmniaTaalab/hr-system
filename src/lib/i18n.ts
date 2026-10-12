"use client";

import { createContext, useContext } from "react";
import en from "./locales/en";
import ar from "./locales/ar";

export type Language = "en" | "ar";
export type Direction = "ltr" | "rtl";

export const LANGUAGE_STORAGE_KEY = "hr_system_lang";
export const GUIDE_LANGUAGE_STORAGE_KEY = "nis_guide_lang";

export const translations = {
  en,
  ar,
};

export type TranslationsType = typeof en;

export interface I18nContextType {
  lang: Language;
  dir: Direction;
  isRTL: boolean;
  setLang: (newLang: Language) => void;
  toggleLang: () => void;
  t: (key: string, fallback?: string) => string;
  tText: (enText: string, arText: string) => string;
}

export const I18nContext = createContext<I18nContextType>({
  lang: "ar",
  dir: "rtl",
  isRTL: true,
  setLang: () => {},
  toggleLang: () => {},
  t: (key: string, fallback?: string) => fallback || key,
  tText: (enText: string, arText: string) => arText || enText,
});

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      lang: "en",
      dir: "ltr",
      isRTL: false,
      setLang: () => {},
      toggleLang: () => {},
      t: (key: string, fallback?: string) => fallback || key,
      tText: (enText: string) => enText,
    };
  }
  return context;
}

// Convenient alias for code clarity
export const useLanguage = useI18n;

export function resolveTranslation(
  dict: any,
  keyPath: string,
  fallback?: string
): string {
  if (!dict || !keyPath) return fallback || keyPath || "";

  const parts = keyPath.split(".");
  let current: any = dict;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return fallback !== undefined ? fallback : keyPath;
    }
  }

  if (typeof current === "string") {
    return current;
  }

  return fallback !== undefined ? fallback : keyPath;
}
