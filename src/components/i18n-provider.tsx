"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Language,
  Direction,
  I18nContext,
  I18nContextType,
  LANGUAGE_STORAGE_KEY,
  GUIDE_LANGUAGE_STORAGE_KEY,
  translations,
  resolveTranslation,
} from "@/lib/i18n";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("ar");
  const [mounted, setMounted] = useState(false);

  // Synchronize document direction and attributes
  const applyDirectionAndLang = useCallback((targetLang: Language) => {
    if (typeof document !== "undefined") {
      const isRtl = targetLang === "ar";
      const dir = isRtl ? "rtl" : "ltr";
      document.documentElement.setAttribute("dir", dir);
      document.documentElement.setAttribute("lang", targetLang);
      document.body.setAttribute("dir", dir);
      if (isRtl) {
        document.documentElement.classList.add("rtl");
        document.body.classList.add("font-arabic");
      } else {
        document.documentElement.classList.remove("rtl");
        document.body.classList.remove("font-arabic");
      }
    }
  }, []);

  // Initialize language from localStorage or cookies on client mount
  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(LANGUAGE_STORAGE_KEY) ||
        localStorage.getItem(GUIDE_LANGUAGE_STORAGE_KEY);

      if (stored === "ar" || stored === "en") {
        setLangState(stored);
        applyDirectionAndLang(stored);
      } else {
        setLangState("ar");
        applyDirectionAndLang("ar");
      }
    } catch {
      setLangState("ar");
      applyDirectionAndLang("ar");
    }
    setMounted(true);
  }, [applyDirectionAndLang]);

  const setLang = useCallback(
    (newLang: Language) => {
      setLangState(newLang);
      applyDirectionAndLang(newLang);

      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
        localStorage.setItem(GUIDE_LANGUAGE_STORAGE_KEY, newLang);
        document.cookie = `${LANGUAGE_STORAGE_KEY}=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
        // Dispatch storage/custom event for non-react listeners
        window.dispatchEvent(new CustomEvent("hr_language_changed", { detail: { lang: newLang } }));
      } catch (err) {
        console.warn("Could not save language preference:", err);
      }
    },
    [applyDirectionAndLang]
  );

  const toggleLang = useCallback(() => {
    setLang(lang === "en" ? "ar" : "en");
  }, [lang, setLang]);

  // Translation helper function
  const t = useCallback(
    (key: string, fallback?: string): string => {
      const currentDict = translations[lang];
      const enDict = translations.en;

      // Try active language first
      const val = resolveTranslation(currentDict, key);
      if (val !== key) {
        return val;
      }

      // If active is Arabic and missing, fallback to English
      if (lang === "ar") {
        const enVal = resolveTranslation(enDict, key);
        if (enVal !== key) {
          return enVal;
        }
      }

      return fallback !== undefined ? fallback : key;
    },
    [lang]
  );

  // Inline dual-language helper: returns arText when Arabic, enText when English
  const tText = useCallback(
    (enText: string, arText: string): string => {
      return lang === "ar" ? arText : enText;
    },
    [lang]
  );

  const isRTL = lang === "ar";
  const dir: Direction = isRTL ? "rtl" : "ltr";

  const contextValue: I18nContextType = useMemo(
    () => ({
      lang,
      dir,
      isRTL,
      setLang,
      toggleLang,
      t,
      tText,
    }),
    [lang, dir, isRTL, setLang, toggleLang, t, tText]
  );

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}
