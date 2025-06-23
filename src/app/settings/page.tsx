
"use client";

import React, { useState, useEffect, useActionState, useTransition } from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  addHolidayAction, 
  deleteHolidayAction, 
  updateWeekendSettingsAction,
  type HolidayState,
  type WeekendSettingsState
} from "@/app/actions/settings-actions";
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot, orderBy, Timestamp, doc, getDoc } from 'firebase/firestore';
import { format, getYear } from 'date-fns';
import { Calendar as CalendarIcon, PlusCircle, Trash2, Loader2, AlertCircle, Settings as SettingsIcon, Save } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Skeleton } from '@/components/ui/skeleton';

interface Holiday {
  id: string;
  name: string;
  date: Timestamp;
}

const initialHolidayState: HolidayState = { success: false, message: null, errors: {} };
const initialWeekendState: WeekendSettingsState = { success: false, message: null, errors: {} };
const currentYear = getYear(new Date());
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const daysOfWeek = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
];

export default function SettingsPage() {
  const { toast } = useToast();
  
  // --- HOLIDAY STATE ---
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  const [addHolidayForm, setAddHolidayForm] = useState<{name: string, date?: Date}>({ name: "" });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // --- WEEKEND STATE ---
  const [weekendDays, setWeekendDays] = useState<number[]>([]);
  const [isLoadingWeekend, setIsLoadingWeekend] = useState(true);
  const [isWeekendFormDirty, setIsWeekendFormDirty] = useState(false);
  
  // --- ACTION STATES ---
  const [addState, addAction, isAddPending] = useActionState(addHolidayAction, initialHolidayState);
  const [deleteState, deleteAction, isDeletePending] = useActionState(deleteHolidayAction, initialHolidayState);
  const [updateWeekendState, updateWeekendAction, isUpdateWeekendPending] = useActionState(updateWeekendSettingsAction, initialWeekendState);
  const [_isPending, startTransition] = useTransition();

  // --- USE EFFECTS ---

  // Fetch holidays for the selected year
  useEffect(() => {
    setIsLoadingHolidays(true);
    const startOfYear = new Date(Date.UTC(selectedYear, 0, 1));
    const endOfYear = new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59));

    const q = query(
      collection(db, "holidays"),
      where("date", ">=", Timestamp.fromDate(startOfYear)),
      where("date", "<=", Timestamp.fromDate(endOfYear)),
      orderBy("date", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const holidaysData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Holiday));
      setHolidays(holidaysData);
      setIsLoadingHolidays(false);
    }, (error) => {
      console.error("Error fetching holidays:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load holidays." });
      setIsLoadingHolidays(false);
    });

    return () => unsubscribe();
  }, [selectedYear, toast]);

  // Fetch weekend settings on component mount
  useEffect(() => {
    setIsLoadingWeekend(true);
    const settingsRef = doc(db, "settings", "weekend");
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists() && Array.isArray(docSnap.data().days)) {
            setWeekendDays(docSnap.data().days);
        } else {
            setWeekendDays([5, 6]); 
        }
        setIsLoadingWeekend(false);
        setIsWeekendFormDirty(false); // Reset dirty state on fetch
    }, (error) => {
        console.error("Failed to fetch weekend settings", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load weekend settings.' });
        setWeekendDays([5, 6]);
        setIsLoadingWeekend(false);
    });

    return () => unsubscribe();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Toasts for action completions
  useEffect(() => {
    if (addState?.message) {
      toast({
        title: addState.success ? "Success" : "Error",
        description: addState.message,
        variant: addState.success ? "default" : "destructive",
      });
      if (addState.success) {
        setAddHolidayForm({ name: "" });
      }
    }
  }, [addState, toast]);

  useEffect(() => {
    if (deleteState?.message) {
      toast({
        title: deleteState.success ? "Success" : "Error",
        description: deleteState.message,
        variant: deleteState.success ? "default" : "destructive",
      });
    }
  }, [deleteState, toast]);
  
  useEffect(() => {
    if (updateWeekendState?.message) {
      toast({
        title: updateWeekendState.success ? "Success" : "Error",
        description: updateWeekendState.message,
        variant: updateWeekendState.success ? "default" : "destructive",
      });
      if (updateWeekendState.success) {
        setIsWeekendFormDirty(false); // Reset dirty state on successful save
      }
    }
  }, [updateWeekendState, toast]);


  // --- HANDLER FUNCTIONS ---
  const handleAddHoliday = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addHolidayForm.date) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Please select a date for the holiday.' });
        return;
    }
    const formData = new FormData(e.currentTarget);
    formData.append('date', addHolidayForm.date.toISOString());
    startTransition(() => {
      addAction(formData);
    });
  };
  
  const handleWeekendDayChange = (dayValue: number, isChecked: boolean) => {
    setWeekendDays(prev => {
      const newSet = new Set(prev);
      if (isChecked) {
        newSet.add(dayValue);
      } else {
        newSet.delete(dayValue);
      }
      return Array.from(newSet).sort();
    });
    setIsWeekendFormDirty(true);
  };
  
  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <SettingsIcon className="mr-3 h-8 w-8 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground">
            Manage company-wide settings like official holidays and weekends.
          </p>
        </header>
        
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Weekend Settings</CardTitle>
            <CardDescription>Select the days of the week that are considered the weekend. These days will be excluded from leave calculations.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateWeekendAction}>
              {isLoadingWeekend ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({length: 7}).map((_, i) => <Skeleton key={i} className="h-6 w-24" />)}
                  </div>
                  <Skeleton className="h-10 w-48" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {daysOfWeek.map(day => (
                      <div key={day.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`day-${day.value}`}
                          name="weekend"
                          value={day.value.toString()}
                          checked={weekendDays.includes(day.value)}
                          onCheckedChange={(isChecked) => {
                            handleWeekendDayChange(day.value, isChecked as boolean);
                          }}
                        />
                        <Label htmlFor={`day-${day.value}`}>{day.label}</Label>
                      </div>
                    ))}
                  </div>
                  {updateWeekendState?.errors?.form && 
                    <div className="flex items-center text-sm text-destructive">
                      <AlertCircle className="mr-2 h-4 w-4" />
                      {updateWeekendState.errors.form[0]}
                    </div>
                  }
                  <Button type="submit" disabled={!isWeekendFormDirty || isUpdateWeekendPending}>
                    {isUpdateWeekendPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                    Save Weekend
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Manage Official Holidays</CardTitle>
            <CardDescription>
              Add or remove official holidays for the company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Label htmlFor="year-select" className="text-base">Year:</Label>
              <Select onValueChange={(value) => setSelectedYear(parseInt(value))} defaultValue={selectedYear.toString()}>
                <SelectTrigger id="year-select" className="w-[180px]">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <form onSubmit={handleAddHoliday} className="p-4 border rounded-lg bg-muted/20 space-y-4">
              <h3 className="font-medium">Add New Holiday</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="space-y-2">
                    <Label htmlFor="holiday-name">Holiday Name</Label>
                    <Input id="holiday-name" name="name" value={addHolidayForm.name}
                      onChange={e => setAddHolidayForm(prev => ({...prev, name: e.target.value}))}
                      placeholder="e.g., New Year's Day" required 
                    />
                    {addState?.errors?.name && <p className="text-xs text-destructive mt-1">{addState.errors.name[0]}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !addHolidayForm.date && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {addHolidayForm.date ? format(addHolidayForm.date, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={addHolidayForm.date} onSelect={date => {
                            setAddHolidayForm(prev => ({ ...prev, date })); setIsCalendarOpen(false);
                          }} initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {addState?.errors?.date && <p className="text-xs text-destructive mt-1">{addState.errors.date[0]}</p>}
                  </div>
              </div>
              {addState?.errors?.form && 
                <div className="flex items-center text-sm text-destructive">
                  <AlertCircle className="mr-2 h-4 w-4" />
                  {addState.errors.form[0]}
                </div>
              }
              <Button type="submit" disabled={isAddPending}>
                {isAddPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                Add Holiday
              </Button>
            </form>
            <div>
              <h3 className="font-medium mb-2">Holidays for {selectedYear}</h3>
              {isLoadingHolidays ? (
                <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
              ) : holidays.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead><TableHead>Holiday Name</TableHead><TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holidays.map(holiday => (
                        <TableRow key={holiday.id}>
                          <TableCell>{format(holiday.date.toDate(), 'PPP')}</TableCell>
                          <TableCell className="font-medium">{holiday.name}</TableCell>
                          <TableCell className="text-right">
                            <form action={deleteAction}>
                                <input type="hidden" name="holidayId" value={holiday.id} />
                                <Button type="submit" variant="ghost" size="icon" disabled={isDeletePending} aria-label="Delete holiday">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </form>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">No holidays added for {selectedYear}.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
