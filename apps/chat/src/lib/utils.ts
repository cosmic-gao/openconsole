import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn 惯例：clsx 合并条件类名 + tailwind-merge 去重冲突的 Tailwind 类。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
