import type { ComponentProps } from "react";

function Kbd({ className = "", ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={`pointer-events-none inline-flex h-7 w-fit min-w-7 select-none items-center justify-center gap-1 rounded-md px-2 font-sans text-sm font-medium leading-none ${className}`}
      style={{
        backgroundColor: "var(--color-border)",
        color: "var(--color-text-primary)",
      }}
      {...props}
    />
  );
}

function KbdGroup({ className = "", ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={`inline-flex items-center gap-1.5 ${className}`}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
