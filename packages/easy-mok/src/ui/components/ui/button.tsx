import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
	default:
		"bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
	outline:
		"border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
	ghost: "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white",
	danger: "bg-rose-600 text-white hover:bg-rose-500",
} as const;
/** md 是表单与工具栏的标准高度(28px), sm 用于行内与面板头部(24px) */
const SIZES = {
	sm: "h-6 gap-1 px-2 text-xs",
	md: "h-7 gap-1.5 px-2.5 text-sm",
	icon: "size-7 p-0",
	"icon-sm": "size-6 p-0",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: keyof typeof VARIANTS;
	size?: keyof typeof SIZES;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant = "outline", size = "md", type = "button", ...props }, ref) => (
		<button
			ref={ref}
			type={type}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-45",
				VARIANTS[variant],
				SIZES[size],
				className
			)}
			{...props}
		/>
	)
);
Button.displayName = "Button";
