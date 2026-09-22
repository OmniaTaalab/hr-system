"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { WifiOff, Wifi, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectionState = "online" | "offline" | "unstable";

export function NetworkStatusBanner() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("online");
  const [isChecking, setIsChecking] = useState(false);
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);
  const lastStateRef = useRef<ConnectionState>("online");
  const failureCountRef = useRef(0);

  const checkConnectivity = useCallback(async (): Promise<ConnectionState> => {
    // 1. If browser navigator reports offline, it's definitely offline
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return "offline";
    }

    // 2. Perform a lightweight ping to verify actual connection reachability & latency
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout
    const startTime = Date.now();

    try {
      const response = await fetch(`/api/health?t=${Date.now()}`, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const elapsed = Date.now() - startTime;

      if (response.ok) {
        failureCountRef.current = 0;
        // Latency > 2500ms indicates severe instability
        if (elapsed > 2500) {
          return "unstable";
        }
        return "online";
      } else {
        failureCountRef.current += 1;
        return failureCountRef.current >= 2 ? "offline" : "unstable";
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      failureCountRef.current += 1;
      // Abort (timeout) or network error
      return failureCountRef.current >= 2 ? "offline" : "unstable";
    }
  }, []);

  const handleManualRetry = async () => {
    setIsChecking(true);
    const result = await checkConnectivity();
    setConnectionState(result);
    setIsChecking(false);
    if (result === "online") {
      setShowRestoredNotice(true);
      setTimeout(() => setShowRestoredNotice(false), 3000);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;

    const handleOffline = () => {
      failureCountRef.current = 2;
      setConnectionState("offline");
    };

    const handleOnline = async () => {
      setIsChecking(true);
      const state = await checkConnectivity();
      if (isMounted) {
        setConnectionState(state);
        setIsChecking(false);
        if (state === "online") {
          setShowRestoredNotice(true);
          setTimeout(() => {
            if (isMounted) setShowRestoredNotice(false);
          }, 3500);
        }
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Initial check
    if (!navigator.onLine) {
      setConnectionState("offline");
    }

    // Periodic heartbeat check every 15 seconds
    const interval = setInterval(async () => {
      const state = await checkConnectivity();
      if (!isMounted) return;

      if (state !== lastStateRef.current) {
        if (lastStateRef.current !== "online" && state === "online") {
          setShowRestoredNotice(true);
          setTimeout(() => {
            if (isMounted) setShowRestoredNotice(false);
          }, 3500);
        }
        lastStateRef.current = state;
        setConnectionState(state);
      }
    }, 15000);

    return () => {
      isMounted = false;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearInterval(interval);
    };
  }, [checkConnectivity]);

  // If connection is restored, show temporary positive banner
  if (showRestoredNotice && connectionState === "online") {
    return (
      <aside
        aria-label="Network status notification"
        className="fixed top-0 left-0 right-0 z-[9999] bg-emerald-600 text-white px-4 py-2.5 shadow-md flex items-center justify-center gap-2 text-sm font-medium animate-in slide-in-from-top duration-300"
      >
        <Wifi className="h-4 w-4 text-white flex-shrink-0 animate-bounce" />
        <span>Internet Connection Restored</span>
      </aside>
    );
  }

  // If offline or unstable, show prominent error banner with exact required text
  if (connectionState === "offline" || connectionState === "unstable") {
    return (
      <aside
        aria-label="Network error banner"
        className={cn(
          "fixed top-0 left-0 right-0 z-[9999] px-4 py-2.5 text-white shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top duration-300",
          connectionState === "offline"
            ? "bg-rose-600 dark:bg-rose-700"
            : "bg-amber-600 dark:bg-amber-700"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {connectionState === "offline" ? (
            <WifiOff className="h-5 w-5 text-white flex-shrink-0 animate-pulse" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-white flex-shrink-0 animate-pulse" />
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
            <span className="font-semibold text-sm tracking-wide">
              Internet Connection Failed or not stable
            </span>
            <span className="text-xs text-white/90 hidden md:inline">
              (Please check your network connection. Some actions may fail or remain unsaved.)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs px-2.5 bg-white/20 hover:bg-white/30 text-white border-0 font-medium transition-colors"
            onClick={handleManualRetry}
            disabled={isChecking}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isChecking && "animate-spin")} />
            {isChecking ? "Checking..." : "Retry"}
          </Button>
        </div>
      </aside>
    );
  }

  return null;
}
