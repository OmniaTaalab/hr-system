
"use client";

import React, { useActionState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, LogOut } from 'lucide-react';
import { clockInAction, type ClockInState, clockOutAction, type ClockOutState } from '@/app/actions/attendance-actions';

const initialClockInState: ClockInState = { success: false, errors: {}, message: null };
const initialClockOutState: ClockOutState = { success: false, errors: {}, message: null };

interface ClockInButtonProps {
    employeeId: string;
    employeeName: string;
}

export function ClockInButton({ employeeId, employeeName }: ClockInButtonProps) {
    const { toast } = useToast();
    const [state, formAction, isPending] = useActionState(clockInAction, initialClockInState);

    useEffect(() => {
        if (state.message) {
            toast({
                title: state.success ? "Clock In Success" : "Clock In Failed",
                description: state.message,
                variant: state.success ? "default" : "destructive",
            });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <input type="hidden" name="employeeDocId" value={employeeId} />
            <input type="hidden" name="employeeName" value={employeeName} />
            <Button type="submit" size="sm" variant="outline" className="bg-green-500 hover:bg-green-600 text-white" disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                Clock In
            </Button>
        </form>
    );
}

interface ClockOutButtonProps {
    attendanceRecordId: string;
    employeeId: string;
    employeeName: string;
}

export function ClockOutButton({ attendanceRecordId, employeeId, employeeName }: ClockOutButtonProps) {
    const { toast } = useToast();
    const [state, formAction, isPending] = useActionState(clockOutAction, initialClockOutState);

    useEffect(() => {
        if (state.message) {
            toast({
                title: state.success ? "Clock Out Success" : "Clock Out Failed",
                description: state.message,
                variant: state.success ? "default" : "destructive",
            });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <input type="hidden" name="attendanceRecordId" value={attendanceRecordId} />
            <input type="hidden" name="employeeDocId" value={employeeId} />
            <input type="hidden" name="employeeName" value={employeeName} />
            <Button type="submit" size="sm" variant="destructive" disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                Clock Out
            </Button>
        </form>
    );
}
