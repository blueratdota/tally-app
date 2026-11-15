import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:bg-foreground group-[.toaster]:text-background group-[.toaster]:border-foreground group-[.toaster]:shadow-lg",
        error: "group-[.toaster]:bg-destructive group-[.toaster]:border-destructive",
      },
    }}
    {...props}
  />
)

export { Toaster }
