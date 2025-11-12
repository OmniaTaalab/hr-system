
"use client";

import React, { useState, useRef, useActionState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, FileUp } from 'lucide-react';
import { db, storage } from '@/lib/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { uploadCertificateAction, type CertificateUploadState } from '@/app/actions/employee-actions';

interface CertificateUploaderProps {
  employeeId: string;
  actorProfile: { id?: string; email?: string; role?: string; } | null;
}

const initialUploadState: CertificateUploadState = { success: false };

export function CertificateUploader({ employeeId, actorProfile }: CertificateUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [uploadState, uploadAction, isActionPending] = useActionState(uploadCertificateAction, initialUploadState);

  React.useEffect(() => {
    if (uploadState?.message) {
      toast({
        title: uploadState.success ? "Success" : "Error",
        description: uploadState.message,
        variant: uploadState.success ? "default" : "destructive",
      });
      if (uploadState.success) {
        setIsOpen(false);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  }, [uploadState, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({ variant: "destructive", title: "File too large", description: "Please select a file smaller than 10MB." });
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      toast({ variant: "destructive", title: "No File", description: "Please select a certificate file to upload." });
      return;
    }

    setIsUploading(true);
    const formData = new FormData(event.currentTarget);

    try {
      const filePath = `employee-documents/${employeeId}/certificates/${selectedFile.name}-${Date.now()}`;
      const fileRef = ref(storage, filePath);
      const snapshot = await uploadBytes(fileRef, selectedFile);
      const downloadURL = await getDownloadURL(snapshot.ref);

      formData.set('fileUrl', downloadURL);
      uploadAction(formData);

    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast({ variant: "destructive", title: "Upload Failed", description: "Could not upload the file. Please try again." });
    } finally {
      setIsUploading(false);
    }
  };

  const isPending = isUploading || isActionPending;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UploadCloud className="mr-2 h-4 w-4" />
          Upload Certificate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Upload New Certificate</DialogTitle>
            <DialogDescription>
              Provide a name for the certificate and select the file to upload.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <input type="hidden" name="employeeDocId" value={employeeId} />
            <input type="hidden" name="actorId" value={actorProfile?.id || ''} />
            <input type="hidden" name="actorEmail" value={actorProfile?.email || ''} />
            <input type="hidden" name="actorRole" value={actorProfile?.role || ''} />

            <div className="space-y-2">
              <Label htmlFor="certificateName">Certificate Name</Label>
              <Input id="certificateName" name="certificateName" required disabled={isPending} />
              {uploadState?.errors?.certificateName && <p className="text-sm text-destructive">{uploadState.errors.certificateName[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="certificateFile">Certificate File</Label>
              <Input id="certificateFile" type="file" ref={fileInputRef} onChange={handleFileChange} required disabled={isPending} />
            </div>
             {uploadState?.errors?.form && <p className="text-sm text-destructive">{uploadState.errors.form[0]}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !selectedFile}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              Submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
