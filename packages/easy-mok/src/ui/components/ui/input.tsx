import {
	forwardRef,
	type InputHTMLAttributes,
	type SelectHTMLAttributes,
	type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const FIELD =
	"min-w-0 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 placeholder:text-zinc-400 hover:border-zinc-400 focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500 aria-invalid:border-rose-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-300";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
	({ className, ...props }, ref) => (
		<input ref={ref} className={cn(FIELD, "h-7 w-full", className)} {...props} />
	)
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
	({ className, ...props }, ref) => (
		<select ref={ref} className={cn(FIELD, "select-chevron h-7 pr-6", className)} {...props} />
	)
);
Select.displayName = "Select";

export const Textarea = forwardRef<
	HTMLTextAreaElement,
	TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
	<textarea
		ref={ref}
		className={cn(FIELD, "block w-full py-1.5 font-mono text-xs", className)}
		{...props}
	/>
));
Textarea.displayName = "Textarea";

/** 字段标签: 标签文字在上, 控件在下 */
export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
	<label
		className={cn(
			"flex min-w-0 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400",
			className
		)}
		{...props}
	/>
);

export const FieldError = ({ children }: { children?: React.ReactNode }) =>
	children ? (
		<span role="alert" className="text-xs text-rose-600">
			{children}
		</span>
	) : null;

/** 字段下方或分区里的一行说明 */
export const Hint = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
	<p className={cn("text-xs text-zinc-500 dark:text-zinc-400", className)} {...props} />
);
