import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "w-5 h-5 border-2",
  md: "w-8 h-8 border-[3px]",
  lg: "w-10 h-10 border-4",
};

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "rounded-full border-indigo-600 border-t-transparent animate-spin",
        sizeMap[size],
        className
      )}
    />
  );
}
