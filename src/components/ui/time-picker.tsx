
"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";


interface TimePickerProps {
  value: string; // "HH:MM" or ""
  onChange: (value: string) => void;
  disabled?: boolean;
}

const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const minutes = Array.from({ length: 60 / 5 }, (_, i) => (i * 5).toString().padStart(2, '0'));

export function TimePicker({ value, onChange, disabled }: TimePickerProps) {
  const [selectedHour, selectedMinute] = value ? value.split(":") : ["", ""];

  const handleHourChange = (hour: string) => {
    onChange(`${hour}:${selectedMinute || '00'}`);
  };

  const handleMinuteChange = (minute: string) => {
    onChange(`${selectedHour || '09'}:${minute}`);
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <div className="flex items-center gap-1">
      <Select onValueChange={handleHourChange} value={selectedHour || undefined} disabled={disabled}>
        <SelectTrigger className="w-[75px] h-9">
          <SelectValue placeholder="Hour" />
        </SelectTrigger>
        <SelectContent>
          {hours.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="font-semibold">:</span>
      <Select onValueChange={handleMinuteChange} value={selectedMinute || undefined} disabled={disabled}>
        <SelectTrigger className="w-[75px] h-9">
          <SelectValue placeholder="Min" />
        </SelectTrigger>
        <SelectContent>
          {minutes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      {value ? (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClear} disabled={disabled} aria-label="Clear time">
          <X className="h-4 w-4" />
        </Button>
      ) : <div className="w-8 h-8" /> /* Placeholder for alignment */}
    </div>
  );
}
