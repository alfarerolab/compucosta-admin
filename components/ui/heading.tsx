import React from "react";
import { cn } from "@/lib/utils";

interface HeadingProps {
  title: string;
  description?: string;
  className?: string;
}

export function Heading({ title, description, className = "" }: HeadingProps) {
  return (
    <div className={cn("mb-4", className)}>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
