"use client";

import React, { useState, useTransition, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Mail,
  Building2,
  Copy,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  Info,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { useUserProfile } from "@/components/layout/app-layout";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import {
  DOCUMENT_REQUEST_TYPES,
  DOCUMENT_REQUEST_TYPE_DETAILS,
  DocumentRequestType,
  DeliveryMethod,
} from "@/types/document-request";
import {
  submitDocumentRequestAction,
  DocumentRequestFormState,
} from "@/app/actions/document-request-actions";

interface SubmitRequestFormProps {
  onSuccess?: () => void;
}

export function SubmitRequestForm({ onSuccess }: SubmitRequestFormProps) {
  const { profile, user } = useUserProfile();
  const router = useRouter();
  const { campuses, isLoading: isLoadingCampuses } = useOrganizationLists();

  const [documentType, setDocumentType] = useState<DocumentRequestType>("Salary Certificate");
  const [numberOfCopies, setNumberOfCopies] = useState<number>(1);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("soft_copy");
  const [collectionCampus, setCollectionCampus] = useState<string>("");
  const [requesterNote, setRequesterNote] = useState<string>("");
  const [addressedTo, setAddressedTo] = useState<string>("");

  const initialState: DocumentRequestFormState = { success: false };
  const [formState, formAction, isPending] = useActionState(
    submitDocumentRequestAction,
    initialState
  );

  // Set default campus from employee profile when loaded
  useEffect(() => {
    if (profile?.campus && !collectionCampus) {
      setCollectionCampus(profile.campus);
    } else if (campuses.length > 0 && !collectionCampus) {
      setCollectionCampus(campuses[0].name);
    }
  }, [profile, campuses, collectionCampus]);

  useEffect(() => {
    if (formState?.success) {
      // Reset optional fields
      setRequesterNote("");
      setAddressedTo("");
      setNumberOfCopies(1);
      if (onSuccess) {
        onSuccess();
      }
    }
  }, [formState, onSuccess]);

  const currentTypeDetails = DOCUMENT_REQUEST_TYPE_DETAILS[documentType];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                New Document Request
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Submit an official document request to HR. Your request will be reviewed and processed according to institutional procedures.
              </CardDescription>
            </div>
            {profile && (
              <Badge variant="outline" className="self-start sm:self-auto py-1 px-2.5 text-xs bg-background">
                Requester: <strong className="ml-1 text-foreground">{profile.name}</strong>
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <form action={formAction} className="space-y-6">
            {/* Hidden user identification fields */}
            <input type="hidden" name="requestingEmployeeDocId" value={profile?.id || ""} />
            <input type="hidden" name="employeeId" value={profile?.employeeId || ""} />
            <input type="hidden" name="employeeName" value={profile?.name || ""} />
            <input type="hidden" name="employeeEmail" value={profile?.nisEmail || profile?.email || user?.email || ""} />
            <input type="hidden" name="employeeCampus" value={profile?.campus || ""} />
            <input type="hidden" name="employeeDivision" value={profile?.division || ""} />
            <input type="hidden" name="employeePosition" value={profile?.position || profile?.role || ""} />
            <input type="hidden" name="userId" value={user?.uid || ""} />
            <input type="hidden" name="actorId" value={profile?.id || user?.uid || ""} />
            <input type="hidden" name="actorEmail" value={profile?.nisEmail || user?.email || ""} />
            <input type="hidden" name="actorRole" value={profile?.role || "employee"} />

            {/* Hidden form fields synced with state */}
            <input type="hidden" name="documentType" value={documentType} />
            <input type="hidden" name="deliveryMethod" value={deliveryMethod} />
            <input type="hidden" name="collectionCampus" value={collectionCampus} />

            {/* Field 1: Document Request Types Dropdown */}
            <div className="space-y-2.5">
              <Label htmlFor="documentTypeSelect" className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-primary" />
                  Document Request Types <span className="text-destructive">*</span>
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {currentTypeDetails?.arName}
                </span>
              </Label>

              <Select
                value={documentType}
                onValueChange={(val) => setDocumentType(val as DocumentRequestType)}
              >
                <SelectTrigger id="documentTypeSelect" className="h-11 bg-background text-base font-medium">
                  <SelectValue placeholder="Select Document Request Type..." />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_REQUEST_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="py-2">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="font-medium">{type}</span>
                        <span className="text-xs text-muted-foreground" dir="rtl">
                          {DOCUMENT_REQUEST_TYPE_DETAILS[type]?.arName}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Helpful dynamic helper banner for chosen type */}
              {currentTypeDetails && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900 text-xs text-sky-900 dark:text-sky-200">
                  <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">{currentTypeDetails.description}</p>
                    {currentTypeDetails.commonAddressedTo.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-muted-foreground text-[11px]">Quick destinations:</span>
                        {currentTypeDetails.commonAddressedTo.map((dst) => (
                          <button
                            key={dst}
                            type="button"
                            onClick={() => setAddressedTo(dst)}
                            className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border text-[11px] hover:border-primary transition-colors"
                          >
                            {dst}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Field 2: Addressed To (Destination Entity) */}
            <div className="space-y-2">
              <Label htmlFor="addressedTo" className="text-sm font-medium">
                Addressed To / Destination Entity <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                id="addressedTo"
                name="addressedTo"
                placeholder="e.g. Commercial International Bank (CIB), Embassy of France, or To Whom It May Concern"
                value={addressedTo}
                onChange={(e) => setAddressedTo(e.target.value)}
                className="h-10 bg-background"
              />
            </div>

            {/* Common Fields Grid: Number of Copies & Delivery Method */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Common Field: Number of Copies */}
              <div className="space-y-2">
                <Label htmlFor="numberOfCopies" className="text-sm font-semibold flex items-center gap-1.5">
                  <Copy className="h-4 w-4 text-primary" />
                  Number of Copies <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="numberOfCopies"
                    name="numberOfCopies"
                    type="number"
                    min={1}
                    max={10}
                    value={numberOfCopies}
                    onChange={(e) => setNumberOfCopies(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    className="w-28 h-10 text-center font-bold text-base bg-background"
                    required
                  />
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3].map((num) => (
                      <Button
                        key={num}
                        type="button"
                        variant={numberOfCopies === num ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNumberOfCopies(num)}
                        className="h-8 w-8 p-0 text-xs"
                      >
                        {num}
                      </Button>
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">Max 10 copies</span>
                  </div>
                </div>
                {formState?.errors?.numberOfCopies && (
                  <p className="text-xs text-destructive">{formState.errors.numberOfCopies[0]}</p>
                )}
              </div>

              {/* Common Field: Delivery Method */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Delivery Method <span className="text-destructive">*</span>
                </Label>
                <RadioGroup
                  value={deliveryMethod}
                  onValueChange={(val) => setDeliveryMethod(val as DeliveryMethod)}
                  className="grid grid-cols-2 gap-3"
                >
                  <label
                    htmlFor="delivery-soft"
                    className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                      deliveryMethod === "soft_copy"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                        <Mail className="h-3.5 w-3.5 text-primary" />
                        Soft Copy
                      </div>
                      <RadioGroupItem value="soft_copy" id="delivery-soft" />
                    </div>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      Official PDF sent by email & downloadable in portal.
                    </span>
                  </label>

                  <label
                    htmlFor="delivery-hard"
                    className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                      deliveryMethod === "hard_copy"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        Hard Copy
                      </div>
                      <RadioGroupItem value="hard_copy" id="delivery-hard" />
                    </div>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      Printed, signed & stamped for campus collection.
                    </span>
                  </label>
                </RadioGroup>
              </div>
            </div>

            {/* Common Field: Collection Campus */}
            <div className="space-y-2 pt-1">
              <Label htmlFor="collectionCampusSelect" className="text-sm font-semibold flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-primary" />
                Collection Campus <span className="text-destructive">*</span>
              </Label>
              <Select
                value={collectionCampus}
                onValueChange={setCollectionCampus}
                disabled={isLoadingCampuses}
              >
                <SelectTrigger id="collectionCampusSelect" className="h-10 bg-background">
                  <SelectValue placeholder={isLoadingCampuses ? "Loading campuses..." : "Select campus for collection..."} />
                </SelectTrigger>
                <SelectContent>
                  {campuses.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {deliveryMethod === "hard_copy"
                  ? "Select the campus HR office where you will collect your printed document."
                  : "Campus associated with your employee record for document registry."}
              </p>
              {formState?.errors?.collectionCampus && (
                <p className="text-xs text-destructive">{formState.errors.collectionCampus[0]}</p>
              )}
            </div>

            {/* Common Field: Requester Note */}
            <div className="space-y-2 pt-1">
              <Label htmlFor="requesterNote" className="text-sm font-semibold flex items-center justify-between">
                <span>Requester Note</span>
                <span className="text-xs text-muted-foreground font-normal">Special requests or mentions</span>
              </Label>
              <Textarea
                id="requesterNote"
                name="requesterNote"
                rows={3}
                placeholder={currentTypeDetails?.suggestedNotesPlaceholder || "Add any specific instructions or requirements..."}
                value={requesterNote}
                onChange={(e) => setRequesterNote(e.target.value)}
                className="bg-background resize-none"
              />
            </div>

            {/* Feedback messages */}
            {formState?.errors?.form && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {formState.errors.form[0]}
              </div>
            )}

            {formState?.success && formState.message && (
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-semibold">{formState.message}</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                    You can track your request status in the "My Requests History" tab.
                  </p>
                </div>
              </div>
            )}

            {/* Submit Action Button */}
            <div className="pt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                Upon submission, HR will be automatically notified via in-app notification and email.
              </div>

              <Button
                type="submit"
                disabled={isPending || !collectionCampus || !profile}
                className="w-full sm:w-auto min-w-[180px] gap-2 font-medium"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting Request...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Request
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
