import { cn } from "@/lib/utils";
import { PawPrint } from "lucide-react";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-bold text-slate", className)}>
      <span aria-hidden className="grid size-8 place-items-center rounded-full bg-slate text-cream">
        <PawPrint className="size-4" />
      </span>
      <span className="text-lg tracking-tight">TuringCare</span>
    </span>
  );
}
