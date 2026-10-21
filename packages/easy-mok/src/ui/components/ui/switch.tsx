import { cn } from "@/lib/utils";

interface SwitchProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	label: string;
	className?: string;
}

export const Switch = ({ checked, onChange, disabled, label, className }: SwitchProps) => (
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		disabled={disabled}
		onClick={() => onChange(!checked)}
		className={cn(
			"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
			checked ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700",
			className
		)}
	>
		<span
			className={cn(
				"inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
				checked ? "translate-x-4.5" : "translate-x-0.5"
			)}
		/>
	</button>
);
