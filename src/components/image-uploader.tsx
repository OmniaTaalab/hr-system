
"use client";

import React, { useState, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Trash2 } from 'lucide-react';
import { storage } from '@/lib/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { updateEmployeePhotoUrl } from '@/app/actions/employee-actions';

interface ImageUploaderProps {
  employeeId: string;
  employeeName?: string;
  currentPhotoUrl: string | null | undefined;
}

export function ImageUploader({ employeeId, employeeName, currentPhotoUrl }: ImageUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl || null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Please select an image smaller than 5MB.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    const storageRef = ref(storage, `employee-avatars/${employeeId}`);

    try {
      // Uploading with the same name overwrites the old file.
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      const result = await updateEmployeePhotoUrl(employeeId, downloadURL);
      if (!result.success) {
        throw new Error(result.message || "Failed to update photo URL in database.");
      }

      setPreviewUrl(downloadURL); // Update preview with final URL
      toast({
        title: "Success",
        description: "Employee photo updated successfully.",
      });
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Could not upload the new photo. Please try again.",
      });
      setPreviewUrl(currentPhotoUrl || null); // Revert preview on failure
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!previewUrl) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `employee-avatars/${employeeId}`);
      await deleteObject(storageRef);
      const result = await updateEmployeePhotoUrl(employeeId, null);
       if (!result.success) {
        throw new Error(result.message || "Failed to remove photo URL from database.");
      }
      
      setPreviewUrl(null);
      toast({
        title: "Photo Removed",
        description: "Employee photo has been removed.",
      });
    } catch (error: any) {
        if (error.code === 'storage/object-not-found') {
            // If the file doesn't exist in storage, just clear it from the DB
            await updateEmployeePhotoUrl(employeeId, null);
            setPreviewUrl(null);
            toast({
                title: "Photo Removed",
                description: "Employee photo was not in storage, but removed from profile.",
            });
        } else {
            console.error("Error removing photo:", error);
            toast({
                variant: "destructive",
                title: "Removal Failed",
                description: error.message || "Could not remove the photo. Please try again.",
            });
        }
    } finally {
      setIsUploading(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "EM"; // Employee
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20 border">
        <AvatarImage src={previewUrl || ''} alt="Employee Avatar" />
        <AvatarFallback>{getInitials(employeeName)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/png, image/jpeg, image/gif"
          className="hidden"
          disabled={isUploading}
        />
        <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {previewUrl ? 'Change Photo' : 'Upload Photo'}
        </Button>
        {previewUrl && (
          <Button type="button" variant="destructive" onClick={handleRemove} disabled={isUploading}>
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
