"use client";

import { type ComponentProps, useRef } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type DateTimeInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  type: "date" | "time" | "datetime-local";
  pickerLabel?: string;
};

export function DateTimeInput({ className, type, pickerLabel, ...props }: DateTimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = type === "time" ? Clock3 : CalendarDays;
  const label = pickerLabel ?? (type === "time" ? "Choose time" : "Choose date");

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    const picker = input as HTMLInputElement & { showPicker?: () => void };
    try {
      picker.showPicker?.();
    } catch {
      input.focus();
    }
  }

  return <span className={cn("date-time-input", className)}>
    <Input ref={inputRef} type={type} className="date-time-input-control" {...props} />
    <button type="button" className="date-time-input-picker" aria-label={label} title={label} onClick={openPicker}><Icon /></button>
  </span>;
}
