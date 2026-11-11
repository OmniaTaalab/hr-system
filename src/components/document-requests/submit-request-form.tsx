"use client";

import React, { useState, useTransition, useActionState, useEffect, useRef } from "react";
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
  Paperclip,
  Upload,
  X,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import { storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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

  const [documentType, setDocumentType] = useState<DocumentRequestType>("HR Letter");
  const [numberOfCopies, setNumberOfCopies] = useState<number>(1);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("soft_copy");
  const [collectionCampus, setCollectionCampus] = useState<string>("");
  const [requesterNote, setRequesterNote] = useState<string>("");
  const [addressedTo, setAddressedTo] = useState<string>("");

  // Attachments state
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string; size?: number; type?: string }>>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAttachmentRequired =
    documentType === "HR Letter" || documentType === "Letter to Social Insurance";

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
      setAttachments([]);
      setUploadError(null);
      if (onSuccess) {
        onSuccess();
      }
    }
  }, [formState, onSuccess]);

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    if (!user?.uid) {
      setUploadError("User authentication is required to upload files.");
      return;
    }

    setIsUploadingFiles(true);
    setUploadError(null);

    const uploadedList: Array<{ name: string; url: string; size?: number; type?: string }> = [];

    for (const file of Array.from(fileList)) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) {
        setUploadError(`File "${file.name}" is not supported. Please upload only images or PDF files.`);
        continue;
      }

      if (file.size > 15 * 1024 * 1024) {
        setUploadError(`File "${file.name}" exceeds the 15MB limit.`);
        continue;
      }

      try {
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `document-request-attachments/${user.uid}/${Date.now()}_${cleanName}`;
        const fileRef = ref(storage, storagePath);
        const snapshot = await uploadBytes(fileRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);

        uploadedList.push({
          name: file.name,
          url: downloadUrl,
          size: file.size,
          type: file.type || (isPdf ? "application/pdf" : "image/*"),
        });
      } catch (err) {
        console.error("Upload error:", err);
        setUploadError(`Failed to upload "${file.name}". Please try again.`);
      }
    }

    setAttachments((prev) => [...prev, ...uploadedList]);
    setIsUploadingFiles(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
            <input type="hidden" name="collectionCampus" value={profile?.campus || collectionCampus || ""} />
            <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />

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
            </div>

            {/* Field 2: Addressed To (Destination Entity) */}
            <div className="space-y-2">
              <Label htmlFor="addressedTo" className="text-sm font-medium">
                Addressed To / Destination Entity <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                id="addressedTo"
                name="addressedTo"
                placeholder="e.g. Commercial International Bank (CIB), Embassy of France "
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

            {/* Supporting Attachments (Images and PDFs, Multiple Selection) */}
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <Label htmlFor="documentAttachmentsInput" className="text-sm font-semibold flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4 text-primary" />
                  Supporting Attachments
                  {isAttachmentRequired ? (
                    <span className="text-destructive font-bold text-base">*</span>
                  ) : (
                    <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  {isAttachmentRequired && (
                    <Badge variant="destructive" className="text-[10px] py-0 px-2 font-normal">
                      Required for {documentType === "HR Letter" ? "HR Letter" : "Letter to Social Insurance"}
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">PDF, PNG, JPG, WEBP (Multiple allowed)</span>
                </div>
              </div>

              {/* Upload Drop Zone / Button */}
              <div
                onClick={() => !isUploadingFiles && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-all ${
                  isAttachmentRequired && attachments.length === 0
                    ? "border-amber-400/80 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50/80 dark:hover:bg-amber-950/30"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="documentAttachmentsInput"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleFileSelection}
                  disabled={isUploadingFiles}
                />

                <div className="flex flex-col items-center justify-center gap-2">
                  {isUploadingFiles ? (
                    <>
                      <Loader2 className="h-7 w-7 text-primary animate-spin" />
                      <p className="text-xs font-medium text-foreground">Uploading files to secure storage...</p>
                    </>
                  ) : (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Click to browse or drop images and PDF files
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Select one or multiple images or PDF files (Up to 15MB each)
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Upload Error feedback */}
              {uploadError && (
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Server validation error */}
              {formState?.errors?.attachments && (
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formState.errors.attachments[0]}</span>
                </div>
              )}

              {/* Requirement indicator if currently empty and required */}
              {isAttachmentRequired && attachments.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5 pt-0.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  At least one attachment (image or PDF) is required for {documentType}.
                </p>
              )}

              {/* List of Uploaded Attachments */}
              {attachments.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>Attached Files ({attachments.length}):</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-primary hover:underline font-normal flex items-center gap-1"
                    >
                      <Upload className="h-3 w-3" />
                      + Add more files
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {attachments.map((file, idx) => {
                      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-all text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded shrink-0 ${
                              isPdf ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" : "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                            }`}>
                              {isPdf ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-foreground hover:underline truncate block hover:text-primary transition-colors"
                                title={file.name}
                              >
                                {file.name}
                              </a>
                              <span className="text-[10px] text-muted-foreground block">
                                {formatFileSize(file.size)} • {isPdf ? "PDF Document" : "Image"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-muted-foreground hover:text-foreground rounded"
                              title="Preview in new tab"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="p-1 text-muted-foreground hover:text-destructive rounded"
                              title="Remove file"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
                disabled={isPending || isUploadingFiles || !profile || (isAttachmentRequired && attachments.length === 0)}
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
