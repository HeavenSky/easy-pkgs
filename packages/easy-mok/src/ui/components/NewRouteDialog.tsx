import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { errorMessage } from "@/api/client";
import { useCreateRoute } from "@/api/queries";
import { JsonEditor, parseJson } from "./JsonEditor";
import { samplePath } from "./TryRequest";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FieldError, Hint, Input, Label } from "./ui/input";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"] as const;

const schema = z.object({
	methods: z.array(z.string()).min(1, "至少选择一个方法"),
	path: z
		.string()
		.trim()
		.regex(/^\/\S*$/, "路径必须以 / 开头且不含空白"),
	weight: z.string().regex(/^-?\d*$/, "权重必须是整数"),
	status: z.string().refine(v => {
		const n = Number(v);
		return Number.isInteger(n) && n >= 100 && n <= 599;
	}, "请输入 100-599 的整数"),
	body: z.string().refine(v => parseJson(v).ok, "JSON 语法错误"),
});
type FormValues = z.infer<typeof schema>;

export interface NewRouteDefaults {
	methods?: string[];
	path?: string;
}

interface Props {
	open: boolean;
	onClose: () => void;
	onCreated: (id: string) => void;
	defaults?: NewRouteDefaults;
}

const blank = (d?: NewRouteDefaults): FormValues => ({
	methods: d?.methods || ["GET"],
	path: d?.path || "/api/",
	weight: "",
	status: "200",
	body: '{\n  "code": 0,\n  "data": null\n}',
});

export const NewRouteDialog = ({ open, onClose, onCreated, defaults }: Props) => {
	const create = useCreateRoute();
	const {
		register,
		handleSubmit,
		control,
		reset,
		watch,
		setError,
		formState: { errors },
	} = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: blank(defaults) });
	const defaultsRef = useRef(defaults);
	defaultsRef.current = defaults;
	useEffect(() => {
		if (open) {
			reset(blank(defaultsRef.current));
		}
	}, [open, reset]);
	const path = watch("path");

	const onSubmit = (v: FormValues) => {
		const body = parseJson(v.body);
		create.mutate(
			{
				methods: v.methods,
				path: v.path.trim(),
				weight: Number(v.weight) || 0,
				response: { status: Number(v.status), body: body.ok ? body.value : null },
			},
			{
				onSuccess: route => {
					toast.success(`已新建 ${route.key}`);
					onClose();
					onCreated(route.id);
				},
				onError: err => {
					const field = (err as { details?: { field?: string } }).details?.field;
					if (field === "path" || field === "methods") {
						setError(field, { message: errorMessage(err) });
					} else {
						toast.error(errorMessage(err));
					}
				},
			}
		);
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="新建 mock 路由"
			footer={
				<>
					<Button onClick={onClose}>取消</Button>
					<Button
						variant="default"
						type="submit"
						form="new-route"
						disabled={create.isPending}
					>
						{create.isPending ? "创建中" : "创建"}
					</Button>
				</>
			}
		>
			<form id="new-route" className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
				<fieldset className="space-y-1">
					<legend className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
						请求方法
					</legend>
					<Controller
						control={control}
						name="methods"
						render={({ field }) => (
							<div className="flex flex-wrap gap-3">
								{METHODS.map(m => (
									<label
										key={m}
										className="flex cursor-pointer items-center gap-1 font-mono text-xs"
									>
										<input
											type="checkbox"
											className="accent-zinc-900 dark:accent-zinc-100"
											checked={field.value.includes(m)}
											onChange={e =>
												field.onChange(
													e.target.checked
														? [...field.value, m]
														: field.value.filter(x => x !== m)
												)
											}
										/>
										{m}
									</label>
								))}
							</div>
						)}
					/>
					<FieldError>{errors.methods?.message}</FieldError>
				</fieldset>
				<div className="flex items-start gap-2">
					<Label className="flex-1">
						路径
						<Input
							className="font-mono"
							aria-invalid={!!errors.path}
							{...register("path")}
						/>
						<FieldError>{errors.path?.message}</FieldError>
						{!errors.path && path && (
							<span className="font-normal text-zinc-500">
								示例请求: <code className="font-mono">{samplePath(path)}</code>;
								支持 :id, :id?, :id(\d+), *
							</span>
						)}
					</Label>
					<Label className="w-24">
						权重(可选)
						<Input inputMode="numeric" {...register("weight")} placeholder="0" />
						<FieldError>{errors.weight?.message}</FieldError>
					</Label>
				</div>
				<Label className="w-20">
					状态码
					<Input inputMode="numeric" {...register("status")} />
					<FieldError>{errors.status?.message}</FieldError>
				</Label>
				<div className="flex flex-col gap-1">
					<div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
						响应体(JSON)
					</div>
					<Controller
						control={control}
						name="body"
						render={({ field }) => (
							<JsonEditor
								label="响应体"
								height="200px"
								value={field.value}
								onChange={field.onChange}
							/>
						)}
					/>
					<FieldError>{errors.body?.message}</FieldError>
				</div>
				<Hint>
					路由写入 mock 目录下的 <code className="font-mono">__gui__.json</code>,
					可提交到仓库共享.
				</Hint>
			</form>
		</Dialog>
	);
};
