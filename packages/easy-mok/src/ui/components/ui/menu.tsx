import { Ellipsis } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type MenuItem = {
	/** 菜单里显示的文字 */
	label: string;
	icon?: ReactNode;
	/** 可访问名称; 缺省用 label */
	ariaLabel?: string;
	danger?: boolean;
	onSelect: () => void;
};

/**
 * 操作按钮的展示规则: 不超过 2 个时平铺成图标按钮, 更多时收进「更多」下拉, 下拉里显示图标加文字.
 * 下拉经 portal 挂到 body 并用 fixed 定位, 不会被滚动的侧栏裁掉, 也不受行内按钮淡出影响; 点外部, Esc 或选中一项后关闭.
 */
export const ActionMenu = ({
	items,
	label = "更多操作",
	className,
}: {
	items: MenuItem[];
	label?: string;
	className?: string;
}) => {
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		if (!open || !trigger.current) return;
		const r = trigger.current.getBoundingClientRect();
		setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
	}, [open]);
	// 下拉渲染出来之后再把焦点给第一项, 方便键盘直接选择
	useEffect(() => {
		if (open && pos) menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
	}, [open, pos]);
	useEffect(() => {
		if (!open) return;
		const close = (e: Event) => {
			if (
				e.target instanceof Node &&
				(menu.current?.contains(e.target) || trigger.current?.contains(e.target))
			)
				return;
			setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false);
				trigger.current?.focus();
			}
		};
		document.addEventListener("mousedown", close);
		window.addEventListener("scroll", close, true);
		window.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", close);
			window.removeEventListener("scroll", close, true);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);
	if (items.length <= 2) {
		return (
			<>
				{items.map(it => (
					<Button
						key={it.label}
						size="icon-sm"
						variant="ghost"
						aria-label={it.ariaLabel || it.label}
						title={it.label}
						className={cn(it.danger && "hover:text-rose-600", className)}
						onClick={it.onSelect}
					>
						{it.icon}
					</Button>
				))}
			</>
		);
	}
	return (
		<>
			<Button
				ref={trigger}
				size="icon-sm"
				variant="ghost"
				aria-label={label}
				title={label}
				aria-haspopup="menu"
				aria-expanded={open}
				className={cn(open && "bg-zinc-100 dark:bg-zinc-800", className)}
				onClick={() => setOpen(!open)}
			>
				<Ellipsis size={14} />
			</Button>
			{open &&
				pos &&
				createPortal(
					<div
						ref={menu}
						role="menu"
						aria-label={label}
						className="fixed z-50 min-w-36 rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
						style={{ top: pos.top, right: pos.right }}
						onKeyDown={e => {
							if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
							e.preventDefault();
							const list = [
								...(menu.current?.querySelectorAll<HTMLElement>(
									"[role=menuitem]"
								) || []),
							];
							const i = list.indexOf(document.activeElement as HTMLElement);
							list[
								(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length
							]?.focus();
						}}
					>
						{items.map(it => (
							<button
								key={it.label}
								type="button"
								role="menuitem"
								aria-label={it.ariaLabel || it.label}
								className={cn(
									"flex h-7 w-full items-center gap-2 rounded px-2 text-left text-sm whitespace-nowrap outline-none hover:bg-zinc-100 focus:bg-zinc-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800",
									it.danger ? "text-rose-600" : "text-zinc-800 dark:text-zinc-200"
								)}
								onClick={() => {
									setOpen(false);
									it.onSelect();
								}}
							>
								<span className="flex size-3.5 shrink-0 items-center justify-center text-zinc-500">
									{it.icon}
								</span>
								{it.label}
							</button>
						))}
					</div>,
					document.body
				)}
		</>
	);
};
