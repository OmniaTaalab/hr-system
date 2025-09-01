
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, Trash2, File as FileIcon } from 'lucide-react';
import { db, storage } from '@/lib/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import type { EmployeeFile } from '@/app/employees/page';
import { Label } from './ui/label';

interface EmployeeFileManagerProps {
  employee: { id: string; documents?: EmployeeFile[] };
}

export function EmployeeFileManager({ employee }: EmployeeFileManagerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [files, setFiles] = useState<EmployeeFile[]>(employee.documents || []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "employee", employee.id), (doc) => {
        const data = doc.data();
        setFiles(data?.documents || []);
    });
    return () => unsub();
  }, [employee.id]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    const filePath = `employee-documents/${employee.id}/${file.name}`;
    const fileRef = ref(storage, filePath);
    const employeeDocRef = doc(db, "employee", employee.id);

    try {
      if (files.some(f => f.name === file.name)) {
        toast({
          variant: "destructive",
          title: "Duplicate File Name",
          description: "A file with this name already exists. Please rename it or delete the existing one.",
        });
        setIsUploading(false);
        if(fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      
      const snapshot = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const newFile: EmployeeFile = {
        name: file.name,
        url: downloadURL,
        uploadedAt: Timestamp.now(),
      };
      
      await updateDoc(employeeDocRef, {
        documents: arrayUnion(newFile)
      });
      
      toast({
        title: "Success",
        description: `File "${file.name}" uploaded successfully.`,
      });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Could not upload the file.",
      });
    } finally {
      setIsUploading(false);
      if(fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (fileName: string) => {
      setIsDeleting(fileName);
      const filePath = `employee-documents/${employee.id}/${fileName}`;
      const fileRef = ref(storage, filePath);
      const employeeDocRef = doc(db, "employee", employee.id);

      try {
          const fileToDelete = files.find(f => f.name === fileName);
          if (!fileToDelete) throw new Error("File not found in record.");
          
          await deleteObject(fileRef);
          await updateDoc(employeeDocRef, { documents: arrayRemove(fileToDelete) });

          toast({ title: "File Removed", description: `File "${fileName}" has been removed.` });
      } catch (error: any) {
          console.error("Error removing file:", error);
          toast({
              variant: "destructive",
              title: "Removal Failed",
              description: error.message || "Could not remove the file.",
          });
      } finally {
          setIsDeleting(null);
      }
  };

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex justify-between items-center">
        <Label className="text-base font-semibold">Employee Documents</Label>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          Upload File
        </Button>
      </div>
       <p className="text-xs text-muted-foreground">Upload CV, National ID, and other relevant documents.</p>
      <div className="border rounded-md">
        {files.length > 0 ? (
          <ul className="divide-y max-h-48 overflow-y-auto">
            {files.map(file => (
              <li key={file.name} className="p-2 flex justify-between items-center group">
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate flex items-center gap-2">
                  <FileIcon className="h-4 w-4 text-muted-foreground" />
                  {file.name}
                </a>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(file.name)} disabled={!!isDeleting}>
                  {isDeleting === file.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground text-center p-4">No documents uploaded.</p>
        )}
      </div>
    </div>
  );
}
