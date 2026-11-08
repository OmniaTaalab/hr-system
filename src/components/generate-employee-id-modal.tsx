"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { generateUnusedEmployeeIdAction } from "@/lib/firebase/admin-actions";
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Hash,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GenerateEmployeeIdModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

export function GenerateEmployeeIdModal({
  open,
  onOpenChange,
  actorId,
  actorEmail,
  actorRole,
}: GenerateEmployeeIdModalProps) {
  const { toast } = useToast();
  const { isRTL } = useI18n();

  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [historyIds, setHistoryIds] = useState<string[]>([]);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleGenerate = useCallback(
    async (isAnother = false) => {
      setIsLoading(true);
      setError(null);
      setCopied(false);

      if (!isAnother) {
        setGeneratedId(null);
      }

      try {
        const excludeList = isAnother && generatedId ? [...historyIds, generatedId] : historyIds;

        const result = await generateUnusedEmployeeIdAction({
          actorId,
          actorEmail,
          excludeIds: excludeList,
          preferredStart: generatedId ? Number(generatedId) + 1 : undefined,
        });

        if (!isMountedRef.current) return;

        if (result.success && result.employeeId) {
          setGeneratedId(result.employeeId);
          setHistoryIds((prev) => (result.employeeId ? [...prev, result.employeeId] : prev));
          setError(null);
        } else {
          setGeneratedId(null);
          setError(result.error || "Failed to generate an available Employee ID.");
        }
      } catch (err: any) {
        if (!isMountedRef.current) return;
        setGeneratedId(null);
        setError(err?.message || "Failed to communicate with the server.");
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [actorId, actorEmail, generatedId, historyIds]
  );

  // Auto-generate on open if no ID is present
  useEffect(() => {
    if (open) {
      if (!generatedId && !isLoading) {
        handleGenerate(false);
      }
    } else {
      // Reset copied state when closing
      setCopied(false);
    }
  }, [open]);

  const handleCopy = async () => {
    if (!generatedId) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedId);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = generatedId;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopied(true);
      toast({
        title: isRTL ? "تم نسخ كود الموظف" : "Employee ID Copied",
        description: isRTL
          ? `تم نسخ الكود ${generatedId} إلى الحافظة بنجاح.`
          : `ID ${generatedId} copied to clipboard.`,
      });

      setTimeout(() => {
        if (isMountedRef.current) {
          setCopied(false);
        }
      }, 2500);
    } catch {
      toast({
        title: isRTL ? "خطأ في النسخ" : "Copy Failed",
        description: isRTL ? "تعذر نسخ الكود تلقائياً." : "Could not copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                {isRTL ? "توليد كود موظف" : "Generate Employee ID"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isRTL
                  ? "توليد كود موظف متاح دون إنشاء سجل موظف."
                  : "Generate an available Employee ID without creating an employee."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center p-8 bg-muted/30 rounded-xl border border-dashed border-border gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {isRTL ? "جاري التحقق من قاعدة البيانات..." : "Checking Firestore database..."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isRTL
                    ? "التحقق من عدم استخدام الكود والتأكد من توفره"
                    : "Verifying ID is unique and not assigned to any employee"}
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {!isLoading && error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl space-y-3">
              <div className="flex items-start gap-3 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">
                    {isRTL ? "تعذر توليد كود الموظف" : "Generation Failed"}
                  </p>
                  <p className="text-xs text-destructive/90 mt-1 leading-relaxed">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs font-medium"
                onClick={() => handleGenerate(false)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRTL ? "ml-1.5" : "mr-1.5")} />
                {isRTL ? "إعادة المحاولة" : "Try Again"}
              </Button>
            </div>
          )}

          {/* Success state: prominent display of generated ID */}
          {!isLoading && !error && generatedId && (
            <div className="space-y-4">
              <div className="relative group overflow-hidden bg-gradient-to-b from-primary/5 via-primary/[0.08] to-transparent rounded-2xl border-2 border-primary/20 p-6 text-center shadow-sm">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  <Hash className="h-3.5 w-3.5" />
                  <span>{isRTL ? "كود الموظف المتاح" : "Generated Employee ID"}</span>
                </div>

                <div className="text-5xl font-extrabold tracking-widest font-mono text-primary select-all my-2">
                  {generatedId}
                </div>

                <div className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 py-1.5 px-3 rounded-full mx-auto w-fit border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    {isRTL
                      ? "متاح ومتحقق منه في قاعدة البيانات"
                      : "Available & Verified in Firestore"}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  variant={copied ? "secondary" : "default"}
                  className="font-medium"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className={cn("h-4 w-4 text-emerald-600", isRTL ? "ml-2" : "mr-2")} />
                      {isRTL ? "تم النسخ!" : "Copied!"}
                    </>
                  ) : (
                    <>
                      <Copy className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                      {isRTL ? "نسخ الكود" : "Copy ID"}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="font-medium"
                  disabled={isLoading}
                  onClick={() => handleGenerate(true)}
                >
                  <RefreshCw className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                  {isRTL ? "توليد كود آخر" : "Generate Another"}
                </Button>
              </div>

              <div className="flex items-center gap-2 p-2.5 bg-muted/40 rounded-lg text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
                <span>
                  {isRTL
                    ? "هذا الكود متاح حالياً ولم يتم حجزه أو إنشاء أي سجل به حتى الآن."
                    : "This ID is available. It has not been reserved, claimed, or saved to any record."}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-end border-t pt-4">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            {isRTL ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
