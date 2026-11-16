import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "min-w-0 rounded-2xl border bg-card text-card-foreground shadow-[0_2px_8px_rgba(24,46,36,0.025)]",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

export { Card }
