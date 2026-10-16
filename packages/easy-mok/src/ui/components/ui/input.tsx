import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const FIELD = "rounded-md border border-zinc-300 bg-white px-2 text-sm shadow-xs placeholder:text-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 aria-invalid:border-rose-500";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
	<input ref={ref} className={cn(FIELD, "h-8 w-full", className)} {...props} />
));
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
	<select ref={ref} className={cn(FIELD, "select-chevron h-8 pr-7", className)} {...props} />
));
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
	<textarea ref={ref} className={cn(FIELD, "w-full py-1.5 font-mono text-xs", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
	<label className={cn("flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400", className)} {...props} />
);

export const FieldError = ({ children }: { children?: React.ReactNode }) =>
	(children ? <span role="alert" className="text-xs text-rose-600">{children}</span> : null);
