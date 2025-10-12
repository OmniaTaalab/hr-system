
"use client";

import React, { useState, useEffect, useActionState, useMemo, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { 
    manageListItemAction, type ManageListItemState, 
    syncCampusesFromEmployeesAction,
    syncGroupNamesFromEmployeesAction, 
    syncReportLine1FromEmployeesAction,
    syncReportLine2FromEmployeesAction,
    syncRolesFromEmployeesAction,
    syncStagesFromEmployeesAction,
    syncSubjectsFromEmployeesAction,
    syncMachineNamesFromAttendanceLogsAction,
    type SyncState 
} from "@/actions/settings-actions";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, PlusCircle, Edit, Trash2, Search, RefreshCw } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

interface ListItem {
  id: string;
  name: string;
}

interface ListManagerProps {
  title: string;
  collectionName: "roles" | "groupNames" | "systems" | "campuses" | "leaveTypes" | "stage" | "subjects" | "machineNames" | "reportLines1" | "reportLines2";
}

const initialManageState: ManageListItemState = { success: false, message: null, errors: {} };
const initialSyncState: SyncState = { success: false, message: null };

export function ListManager({ title, collectionName }: ListManagerProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<ListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);

  const [addState, addAction, isAddPending] = useActionState(manageListItemAction, initialManageState);
  const [editState, editAction, isEditPending] = useActionState(manageListItemAction, initialManageState);
  const [deleteState, deleteAction, isDeletePending] = useActionState(manageListItemAction, initialManageState);
  
  const [syncGroupState, syncGroupAction, isSyncGroupPending] = useActionState(syncGroupNamesFromEmployeesAction, initialSyncState);
  const [syncCampusState, syncCampusAction, isSyncCampusPending] = useActionState(syncCampusesFromEmployeesAction, initialSyncState);
  const [syncReportLine1State, syncReportLine1Action, isSyncReportLine1Pending] = useActionState(syncReportLine1FromEmployeesAction, initialSyncState);
  const [syncReportLine2State, syncReportLine2Action, isSyncReportLine2Pending] = useActionState(syncReportLine2FromEmployeesAction, initialSyncState);
  const [syncRolesState, syncRolesAction, isSyncRolesPending] = useActionState(syncRolesFromEmployeesAction, initialSyncState);
  const [syncStagesState, syncStagesAction, isSyncStagesPending] = useActionState(syncStagesFromEmployeesAction, initialSyncState);
  const [syncSubjectsState, syncSubjectsAction, isSyncSubjectsPending] = useActionState(syncSubjectsFromEmployeesAction, initialSyncState);
  const [syncMachineNamesState, syncMachineNamesAction, isSyncMachineNamesPending] = useActionState(syncMachineNamesFromAttendanceLogsAction, initialSyncState);


  const addFormRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  
  const isEmailList = collectionName === "reportLines1" || collectionName === "reportLines2";
  const fieldLabel = isEmailList ? "Email" : "Name";
  const fieldType = isEmailList ? "email" : "text";

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, collectionName), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching ${collectionName}:`, error);
      toast({ variant: 'destructive', title: 'Error', description: `Could not load ${title}.` });
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [collectionName, title, toast]);

  useEffect(() => {
      if (addState?.message) {
        toast({ title: addState.success ? "Success" : "Error", description: addState.message, variant: addState.success ? "default" : "destructive" });
        if (addState.success) {
            setIsAddDialogOpen(false);
            addFormRef.current?.reset();
        };
      }
  }, [addState, toast]);

  useEffect(() => {
      if (editState?.message) {
        toast({ title: editState.success ? "Success" : "Error", description: editState.message, variant: editState.success ? "default" : "destructive" });
        if (editState.success) {
            setIsEditDialogOpen(false);
            setSelectedItem(null);
        };
      }
  }, [editState, toast]);

  useEffect(() => {
      if (deleteState?.message) {
        toast({ title: deleteState.success ? "Success" : "Error", description: deleteState.message, variant: deleteState.success ? "default" : "destructive" });
        if (deleteState.success) {
            setIsDeleteDialogOpen(false);
            setSelectedItem(null);
        };
      }
  }, [deleteState, toast]);

  useEffect(() => {
    const states = [syncGroupState, syncCampusState, syncReportLine1State, syncRolesState, syncStagesState, syncSubjectsState, syncMachineNamesState, syncReportLine2State];
    states.forEach(state => {
        if (state?.message) {
            toast({
                title: state.success ? "Sync Complete" : "Sync Failed",
                description: state.message,
                variant: state.success ? "default" : "destructive"
            });
        }
    });
  }, [syncGroupState, syncCampusState, syncReportLine1State, syncRolesState, syncStagesState, syncSubjectsState, syncMachineNamesState, syncReportLine2State, toast]);


  const filteredItems = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    if (!searchTerm.trim()) {
      return items;
    }
    return items.filter(item =>
      item.name.toLowerCase().includes(lowercasedFilter)
    );
  }, [items, searchTerm]);
  
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex justify-between items-center text-lg">
          {title}
          <div className="flex items-center gap-2">
            {collectionName === 'groupNames' && (
              <form action={syncGroupAction}>
                  <Button size="sm" variant="secondary" disabled={isSyncGroupPending}>
                      {isSyncGroupPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync
                  </Button>
              </form>
            )}
            {collectionName === 'campuses' && (
              <form action={syncCampusAction}>
                  <Button size="sm" variant="secondary" disabled={isSyncCampusPending}>
                      {isSyncCampusPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync
                  </Button>
              </form>
            )}
             {collectionName === 'reportLines1' && (
              <form action={syncReportLine1Action}>
                  <Button size="sm" variant="secondary" disabled={isSyncReportLine1Pending}>
                      {isSyncReportLine1Pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync
                  </Button>
              </form>
            )}
            {collectionName === 'reportLines2' && (
              <form action={syncReportLine2Action}>
                  <Button size="sm" variant="secondary" disabled={isSyncReportLine2Pending}>
                      {isSyncReportLine2Pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync
                  </Button>
              </form>
            )}
             {collectionName === 'roles' && (
              <form action={syncRolesAction}>
                  <Button size="sm" variant="secondary" disabled={isSyncRolesPending}>
                      {isSyncRolesPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync
                  </Button>
              </form>
            )}
             {collectionName === 'stage' && (
              <form action={syncStagesAction}>
                  <Button size="sm" variant="secondary" disabled={isSyncStagesPending}>
                      {isSyncStagesPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync
                  </Button>
              </form>
            )}
             {collectionName === 'subjects' && (
              <form action={syncSubjectsAction}>
                  <Button size="sm" variant="secondary" disabled={isSyncSubjectsPending}>
                      {isSyncSubjectsPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync
                  </Button>
              </form>
            )}
            {collectionName === 'machineNames' && (
              <form action={syncMachineNamesAction}>
                  <Button size="sm" variant="secondary" disabled={isSyncMachineNamesPending}>
                      {isSyncMachineNamesPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync
                  </Button>
              </form>
            )}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><PlusCircle className="mr-2 h-4 w-4" /> Add New</Button>
                </DialogTrigger>
                <DialogContent>
                    <form ref={addFormRef} action={addAction}>
                        <DialogHeader>
                            <DialogTitle>Add New {title.slice(0, -1)}</DialogTitle>
                            <DialogDescription>Enter the {fieldLabel.toLowerCase()} for the new item.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <input type="hidden" name="collectionName" value={collectionName} />
                            <input type="hidden" name="operation" value="add" />
                            <Label htmlFor={`add-name-${collectionName}`}>{fieldLabel}</Label>
                            <Input id={`add-name-${collectionName}`} name="name" type={fieldType} required/>
                            {addState?.errors?.name && <p className="text-sm text-destructive mt-1">{addState.errors.name.join(', ')}</p>}
                            {addState?.errors?.form && <p className="text-sm text-destructive mt-1">{addState.errors.form.join(', ')}</p>}
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                            <Button type="submit" disabled={isAddPending}>
                                {isAddPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Add
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
            type="search"
            placeholder={`Search ${title}...`}
            className="w-full pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="border rounded-md max-h-60 overflow-y-auto">
            <Table>
              <TableBody>
                {filteredItems.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right space-x-0">
                      <Dialog open={isEditDialogOpen && selectedItem?.id === item.id} onOpenChange={(open) => { if (!open) setSelectedItem(null); setIsEditDialogOpen(open); }}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedItem(item); setIsEditDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                        </DialogTrigger>
                        <DialogContent>
                             <form ref={editFormRef} action={editAction}>
                                <DialogHeader>
                                    <DialogTitle>Edit {title.slice(0, -1)}</DialogTitle>
                                    <DialogDescription>Update the {fieldLabel.toLowerCase()} of this item.</DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <input type="hidden" name="collectionName" value={collectionName} />
                                    <input type="hidden" name="operation" value="update" />
                                    <input type="hidden" name="id" value={item.id} />
                                    <Label htmlFor={`edit-name-${collectionName}`}>{fieldLabel}</Label>
                                    <Input id={`edit-name-${collectionName}`} name="name" type={fieldType} defaultValue={item.name} required />
                                    {editState?.errors?.name && <p className="text-sm text-destructive mt-1">{editState.errors.name.join(', ')}</p>}
                                    {editState?.errors?.form && <p className="text-sm text-destructive mt-1">{editState.errors.form.join(', ')}</p>}
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                    <Button type="submit" disabled={isEditPending}>
                                        {isEditPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                        Save Changes
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                      </Dialog>
                      <AlertDialog open={isDeleteDialogOpen && selectedItem?.id === item.id} onOpenChange={(open) => { if (!open) setSelectedItem(null); setIsDeleteDialogOpen(open); }}>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { setSelectedItem(item); setIsDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <form action={deleteAction}>
                            <input type="hidden" name="collectionName" value={collectionName} />
                            <input type="hidden" name="operation" value="delete" />
                            <input type="hidden" name="id" value={item.id} />
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>This will permanently delete "{item.name}". This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                              <AlertDialogAction type="submit" disabled={isDeletePending} className="bg-destructive hover:bg-destructive/90">
                                {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Delete"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </form>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">
            {searchTerm ? `No results for "${searchTerm}"` : `No ${title.toLowerCase()} added yet.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
