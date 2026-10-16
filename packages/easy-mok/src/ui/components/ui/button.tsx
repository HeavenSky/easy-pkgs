import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
	default: "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
	outline: "border border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800",
	ghost: "hover:bg-zinc-200/70 dark:hover:bg-zinc-800",
	danger: "bg-rose-600 text-white hover:bg-rose-500",
} as const;
const SIZES = { sm: "h-7 px-2 text-xs", md: "h-8 px-3 text-sm", icon: "h-7 w-7 p-0" } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: keyof typeof VARIANTS;
	size?: keyof typeof SIZES;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "outline", size = "md", type = "button", ...props }, ref) => (
	<button
		ref={ref}
		type={type}
		className={cn("inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50", VARIANTS[variant], SIZES[size], className)}
		{...props}
	/>
));
Button.displayName = "Button";
