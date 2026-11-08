"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Copy,
  Check,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { auth } from "@/lib/firebase/config";
import { generateAvailableEmployeeIdAction } from "@/lib/firebase/admin-actions";
import { cn } from "@/lib/utils";

interface GenerateEmployeeIdModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  actorId?: string;
  actorEmail?: string;
  onUseId?: (id: string) => void;
}

export function GenerateEmployeeIdModal({
  isOpen,
  onOpenChange,
  actorId,
  actorEmail,
  onUseId,
}: GenerateEmployeeIdModalProps) {
  const { toast } = useToast();
  const { t, isRTL } = useI18n();

  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const generateId = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsCopied(false);

    try {
      // Get Firebase Auth ID token for verified server-side authentication
      let idToken: string | undefined;
      try {
        if (auth.currentUser) {
          idToken = await auth.currentUser.getIdToken();
        }
      } catch (tokenErr) {
        console.warn("Could not retrieve idToken for employee ID generation:", tokenErr);
      }

      const result = await generateAvailableEmployeeIdAction({
        idToken,
        actorId,
        actorEmail,
      });

      if (result.success) {
        setGeneratedId(result.employeeId);
      } else {
        setGeneratedId(null);
        setError(result.message || "Failed to generate an Employee ID.");
      }
    } catch (err: any) {
      console.error("Generate Employee ID error:", err);
      setGeneratedId(null);
      setError(err?.message || "An unexpected error occurred while communicating with the server.");
    } finally {
      setIsLoading(false);
    }
  }, [actorId, actorEmail]);

  // When modal is opened, generate an initial ID if one hasn't been generated yet
  useEffect(() => {
    if (isOpen) {
      if (!generatedId) {
        generateId();
      }
    } else {
      // Reset copied state when closed
      setIsCopied(false);
    }
  }, [isOpen, generatedId, generateId]);

  const handleCopy = async () => {
    if (!generatedId) return;

    try {
      await navigator.clipboard.writeText(generatedId);
      setIsCopied(true);
      toast({
        title: isRTL ? "تم نسخ الرقم الوظيفي" : "Employee ID Copied",
        description: isRTL
          ? `تم نسخ الرقم الوظيفي (${generatedId}) إلى الحافظة بنجاح.`
          : `Employee ID (${generatedId}) has been copied to your clipboard.`,
      });

      setTimeout(() => {
        setIsCopied(false);
      }, 2500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
      toast({
        variant: "destructive",
        title: isRTL ? "فشل النسخ" : "Copy Failed",
        description: isRTL ? "يرجى تحديد الرقم ونسخه يدوياً." : "Please copy the ID manually.",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>
                {isRTL ? "توليد كود موظف" : "Generate Employee ID"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm mt-0.5">
                {isRTL
                  ? "توليد رقم وظيفي متاح دون إنشاء سجل موظف في النظام."
                  : "Generate an available Employee ID without creating an employee."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-muted/30 p-8 text-center">
              <Loader2 className="h-9 w-9 animate-spin text-primary mb-3" />
              <p className="text-sm font-medium">
                {isRTL ? "جارٍ التحقق من قاعدة البيانات وتوليد كود متاح..." : "Checking Firestore and generating available ID..."}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isRTL
                  ? "يتم فحص سجلات الموظفين للتأكد من عدم استخدام الرقم."
                  : "Checking employee records to ensure ID is unused."}
              </p>
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold">{isRTL ? "فشل التوليد" : "Generation Failed"}</p>
                  <p className="text-xs mt-1 text-destructive/90">{error}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={generateId}
              >
                <RotateCw className={cn("h-3.5 w-3.5", isRTL ? "ml-1.5" : "mr-1.5")} />
                {isRTL ? "إعادة المحاولة" : "Try Again"}
              </Button>
            </div>
          )}

          {/* Success State with Prominently Displayed ID */}
          {!isLoading && !error && generatedId && (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center space-y-3 shadow-xs">
                <div className="flex items-center justify-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 text-[11px] font-medium px-2 py-0.5"
                  >
                    <CheckCircle2 className={cn("h-3 w-3", isRTL ? "ml-1" : "mr-1 text-emerald-600")} />
                    {isRTL ? "متاح في قاعدة البيانات" : "Available in Firestore"}
                  </Badge>
                </div>

                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    {isRTL ? "الرقم الوظيفي المولد" : "Generated Employee ID"}
                  </span>
                  <div className="font-mono text-4xl sm:text-5xl font-bold tracking-widest text-primary py-1 select-all">
                    {generatedId}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 pt-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>
                    {isRTL
                      ? "تم التحقق: هذا الرقم غير مخصص لأي موظف حالي في قاعدة البيانات."
                      : "Verified: this ID is not assigned to any employee in Firestore."}
                  </span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                  className={cn(
                    "w-full transition-all",
                    isCopied && "border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                  )}
                >
                  {isCopied ? (
                    <>
                      <Check className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                      {isRTL ? "تم النسخ!" : "Copied!"}
                    </>
                  ) : (
                    <>
                      <Copy className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                      {isRTL ? "نسخ الرقم" : "Copy ID"}
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={generateId}
                  disabled={isLoading}
                  className="w-full"
                >
                  <RotateCw className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2", isLoading && "animate-spin")} />
                  {isRTL ? "توليد كود آخر" : "Generate Another"}
                </Button>
              </div>

              {onUseId && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    onUseId(generatedId);
                    onOpenChange(false);
                  }}
                >
                  {isRTL ? "استخدام هذا الكود في نموذج الإضافة" : "Use in Add Employee Form"}
                </Button>
              )}

              <p className="text-[11px] text-muted-foreground text-center">
                {isRTL
                  ? "ملاحظة: هذا الإجراء لا يحجز الرقم ولا ينشئ سجل موظف في النظام."
                  : "Note: Generating an ID does not reserve it or modify any records."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3 flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {isRTL ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
