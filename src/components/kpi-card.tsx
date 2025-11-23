
"use client";

import React, { useState, useEffect, useActionState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { addKpiEntryAction, type KpiEntryState } from "@/app/actions/kpi-actions";
import { useUserProfile } from "@/components/layout/app-layout";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, Plus, Calendar as CalendarIcon, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { AppraisalForm } from './appraisal-form';
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

interface KpiEntry {
  id: string;
  date: Timestamp;
  points: number;
  actorName?: string;
}

interface KpiCardProps {
  title: string;
  kpiType: 'eleot' | 'tot' | 'appraisal';
  employeeDocId: string;
  canEdit: boolean;
}

const initialKpiState: KpiEntryState = { success: false, message: null, errors: {} };

export function KpiCard({ title, kpiType, employeeDocId, canEdit }: KpiCardProps) {
  const { toast } = useToast();
  const [data, setData] = useState<KpiEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { profile } = useUserProfile();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [addState, addAction, isAddPending] = useActionState(addKpiEntryAction, initialKpiState);

  useEffect(() => {
    if (!employeeDocId) {
      setIsLoading(false);
      setData([]);
      return;
    }
    setIsLoading(true);
    const q = query(collection(db, kpiType), where("employeeDocId", "==", employeeDocId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const kpiData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
      kpiData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
      setData(kpiData);
      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching ${kpiType} data:`, error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [kpiType, employeeDocId]);

  useEffect(() => {
    if (addState?.message) {
      toast({
        title: addState.success ? "Success" : "Error",
        description: addState.message,
        variant: addState.success ? "default" : "destructive",
      });
      if (addState.success) {
        setIsDialogOpen(false);
        setSelectedDate(undefined);
      }
    }
  }, [addState, toast]);

  const performanceScore = useMemo(() => {
    if (data.length === 0) return 0;
    const totalPoints = data.reduce((acc, item) => acc + item.points, 0);
    const averagePoints = totalPoints / data.length;
    let scoreOutOf10;

    if (kpiType === 'appraisal') {
        scoreOutOf10 = averagePoints; // already out of 10
    } else {
        scoreOutOf10 = (averagePoints / 4) * 10;
    }
    return parseFloat(scoreOutOf10.toFixed(1));
  }, [data, kpiType]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <p className="text-lg font-bold text-primary">({performanceScore} / 10)</p>
          <CardDescription>
            {data.length > 0 ? `Based on ${data.length} entries` : "No entries yet."}
          </CardDescription>
        </div>
        {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className={cn(kpiType === 'appraisal' && "max-w-3xl")}>
              {kpiType === 'appraisal' ? (
                <AppraisalForm
                  formAction={addAction}
                  isPending={isAddPending}
                  serverState={addState}
                  employeeDocId={employeeDocId}
                  actorProfile={profile}
                  onSuccess={() => setIsDialogOpen(false)}
                />
              ) : (
                <form action={addAction}>
                  <input type="hidden" name="kpiType" value={kpiType} />
                  <input type="hidden" name="employeeDocId" value={employeeDocId || ''} />
                  <input type="hidden" name="date" value={selectedDate?.toISOString() ?? ''} />
                  <input type="hidden" name="actorId" value={profile?.id || ''} />
                  <input type="hidden" name="actorEmail" value={profile?.email || ''} />
                  <input type="hidden" name="actorRole" value={profile?.role || ''} />
                  <input type="hidden" name="actorName" value={profile?.name || ''} />
                  <DialogHeader>
                    <DialogTitle>Add New Entry to {title}</DialogTitle>
                    <DialogDescription>
                      Select a date and enter the points for this entry.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="date" className="text-right">Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={cn("w-[240px] pl-3 text-left font-normal col-span-3", !selectedDate && "text-muted-foreground")}
                          >
                            {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                      {addState?.errors?.date && <p className="col-start-2 col-span-3 text-sm text-destructive">{addState.errors.date.join(', ')}</p>}
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="points" className="text-right">Point</Label>
                      <Input id="points" name="points" type="number" max="4" step="0.1" className="col-span-3" required />
                      {addState?.errors?.points && <p className="col-start-2 col-span-3 text-sm text-destructive">{addState.errors.points.join(', ')}</p>}
                    </div>
                  </div>
                  {addState?.errors?.form && <p className="text-sm text-destructive text-center mb-2">{addState.errors.form.join(', ')}</p>}
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isAddPending}>
                      {isAddPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Confirm
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">No entries yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Point</TableHead>
                <TableHead>Added By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{format(item.date.toDate(), 'PPP')}</TableCell>
                  <TableCell>{kpiType === 'appraisal' ? `${item.points.toFixed(1)} / 10` : `${item.points} / 4`}</TableCell>
                  <TableCell>{item.actorName || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="flex justify-between items-center text-sm text-muted-foreground">
        <span>Showing 1-{data.length} from {data.length}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8 bg-primary text-primary-foreground">1</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardFooter>
    </Card>
  );
}
