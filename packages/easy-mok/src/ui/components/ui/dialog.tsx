import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface DialogProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
	className?: string;
}

/** 原生 dialog: 自带焦点圈定, Esc 关闭与背景遮罩 */
export const Dialog = ({ open, onClose, title, children, footer, className }: DialogProps) => {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) { return; }
		if (open && !el.open) { el.showModal?.(); el.setAttribute("open", ""); }
		if (!open && el.open) { el.close?.(); el.removeAttribute("open"); }
	}, [open]);
	if (!open) { return null; }
	return (
		<dialog
			ref={ref}
			aria-label={title}
			onCancel={e => { e.preventDefault(); onClose(); }}
			className={cn("m-auto w-[min(640px,92vw)] rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100", className)}
		>
			<div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
				<h2 className="text-sm font-semibold">{title}</h2>
				<Button variant="ghost" size="icon" aria-label="关闭" onClick={onClose}><X size={16} /></Button>
			</div>
			<div className="max-h-[70vh] overflow-auto px-4 py-3">{children}</div>
			{footer && <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">{footer}</div>}
		</dialog>
	);
};

interface ConfirmProps {
	open: boolean;
	title: string;
	message: ReactNode;
	confirmText?: string;
	danger?: boolean;
	onConfirm: () => void;
	onClose: () => void;
}

export const ConfirmDialog = ({ open, title, message, confirmText = "确定", danger, onConfirm, onClose }: ConfirmProps) => (
	<Dialog
		open={open}
		onClose={onClose}
		title={title}
		className="w-[min(420px,92vw)]"
		footer={<>
			<Button onClick={onClose}>取消</Button>
			<Button variant={danger ? "danger" : "default"} onClick={() => { onConfirm(); onClose(); }}>{confirmText}</Button>
		</>}
	>
		<div className="text-sm">{message}</div>
	</Dialog>
);
