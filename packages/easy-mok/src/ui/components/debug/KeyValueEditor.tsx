import { Plus, Trash2 } from "lucide-react";
import type { Row } from "@/api/debug-contract";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/** [名, 值, 是否启用] 行表格; 用于 query, 请求头与表单字段 */
export const RowsEditor = ({
	label,
	rows,
	onChange,
	namePlaceholder = "名",
	valuePlaceholder = "值, 可写 {{变量}}",
}: {
	label: string;
	rows: Row[];
	onChange: (rows: Row[]) => void;
	namePlaceholder?: string;
	valuePlaceholder?: string;
}) => {
	const set = (i: number, patch: Partial<{ 0: string; 1: string; 2: boolean }>) =>
		onChange(rows.map((r, j) => (j === i ? ([patch[0] ?? r[0], patch[1] ?? r[1], patch[2] ?? r[2]] as Row) : r)));
	return (
		<div className="space-y-1" role="group" aria-label={label}>
			{rows.map((r, i) => (
				<div key={i} className="flex items-center gap-1.5">
					<input
						type="checkbox"
						aria-label={`启用第 ${i + 1} 项`}
						checked={r[2]}
						onChange={e => set(i, { 2: e.target.checked })}
					/>
					<Input
						aria-label={`${label}名 ${i + 1}`}
						className="w-48 font-mono text-xs"
						placeholder={namePlaceholder}
						value={r[0]}
						onChange={e => set(i, { 0: e.target.value })}
					/>
					<Input
						aria-label={`${label}值 ${i + 1}`}
						className="flex-1 font-mono text-xs"
						placeholder={valuePlaceholder}
						value={r[1]}
						onChange={e => set(i, { 1: e.target.value })}
					/>
					<Button size="icon" variant="ghost" aria-label={`删除第 ${i + 1} 项`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
						<Trash2 size={14} />
					</Button>
				</div>
			))}
			<Button size="sm" variant="ghost" onClick={() => onChange([...rows, ["", "", true]])}>
				<Plus size={14} />
				添加
			</Button>
		</div>
	);
};

/** 变量表 Record<名, 值>; 编辑时转成有序行, 空名的行在保存时丢弃 */
export const VarsEditor = ({
	label,
	vars,
	onChange,
}: {
	label: string;
	vars: Array<[string, string]>;
	onChange: (vars: Array<[string, string]>) => void;
}) => (
	<div className="space-y-1" role="group" aria-label={label}>
		{vars.map(([k, v], i) => (
			<div key={i} className="flex items-center gap-1.5">
				<Input
					aria-label={`${label}名 ${i + 1}`}
					className="w-40 font-mono text-xs"
					placeholder="变量名"
					value={k}
					onChange={e => onChange(vars.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))}
				/>
				<Input
					aria-label={`${label}值 ${i + 1}`}
					className="flex-1 font-mono text-xs"
					placeholder="值; 敏感值写 <secret:来源id>"
					value={v}
					onChange={e => onChange(vars.map((x, j) => (j === i ? [x[0], e.target.value] : x)))}
				/>
				<Button size="icon" variant="ghost" aria-label={`删除变量 ${k || i + 1}`} onClick={() => onChange(vars.filter((_, j) => j !== i))}>
					<Trash2 size={14} />
				</Button>
			</div>
		))}
		<Button size="sm" variant="ghost" onClick={() => onChange([...vars, ["", ""]])}>
			<Plus size={14} />
			添加变量
		</Button>
	</div>
);

export const varsToRecord = (vars: Array<[string, string]>) =>
	Object.fromEntries(vars.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v]));
