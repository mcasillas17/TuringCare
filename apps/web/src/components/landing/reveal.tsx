import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const { ref, isInView } = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none",
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
