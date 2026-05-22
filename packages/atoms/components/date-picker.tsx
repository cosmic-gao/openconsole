"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import {
  Button,
  Calendar,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@openconsole/shadcn";

export interface DatePickerProps {
  value?: Date;
  onValueChange?: (date: Date | undefined) => void;
  placeholder?: string;
  /**
   * date-fns format token. @default "PPP" (e.g. "Apr 29th, 2024")
   */
  formatStr?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onValueChange,
  placeholder = "Pick a date",
  formatStr = "PPP",
  className,
  contentClassName,
  disabled,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-[240px] justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? format(value, formatStr) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-auto p-0", contentClassName)} align="start">
        <Calendar mode="single" selected={value} onSelect={onValueChange} />
      </PopoverContent>
    </Popover>
  );
}
