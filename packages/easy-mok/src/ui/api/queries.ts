import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { API_BASE, ApiError, request } from "./client";
import {
	Groups,
	IgnoreConfig,
	IgnoreValidation,
	LanInfo,
	LogDetail,
	LogSummary,
	Meta,
	Removed,
	RouteDetail,
	RouteSummary,
	SaveSceneResult,
	SceneDetail,
	type Envelope,
	type LogKind,
} from "./contract";

export const keys = {
	meta: ["meta"] as const,
	routes: ["routes"] as const,
	route: (id: string) => ["route", id] as const,
	groups: ["groups"] as const,
	logs: ["logs"] as const,
	log: (id: string) => ["log", id] as const,
	ignore: ["ignore"] as const,
};

export const invalidateRoutes = (qc: QueryClient) =>
	Promise.all([
		qc.invalidateQueries({ queryKey: keys.routes }),
		qc.invalidateQueries({ queryKey: ["route"] }),
		qc.invalidateQueries({ queryKey: keys.meta }),
	]);

export const useMeta = () =>
	useQuery({ queryKey: keys.meta, queryFn: ({ signal }) => request(Meta, "/meta", { signal }) });

export const useRoutes = () =>
	useQuery({
		queryKey: keys.routes,
		queryFn: ({ signal }) => request(z.array(RouteSummary), "/routes", { signal }),
	});

export const useRoute = (id: string | null) =>
	useQuery({
		queryKey: keys.route(id || ""),
		queryFn: ({ signal }) => request(RouteDetail, `/routes/${id}`, { signal }),
		enabled: !!id,
	});

export const useGroups = () =>
	useQuery({
		queryKey: keys.groups,
		queryFn: ({ signal }) => request(Groups, "/groups", { signal }),
	});

export const LOG_LIMIT = 500;
export const useLogs = () =>
	useQuery({
		queryKey: keys.logs,
		queryFn: ({ signal }) =>
			request(z.array(LogSummary), `/logs?limit=${LOG_LIMIT}`, { signal }),
		staleTime: Infinity,
	});

export const useLog = (id: string | null) =>
	useQuery({
		queryKey: keys.log(id || ""),
		queryFn: ({ signal }) => request(LogDetail, `/logs/${id}`, { signal }),
		enabled: !!id,
		retry: false,
	});

export interface RouteStatePatch {
	scene?: string | null;
	mode?: "mock" | "pass" | null;
	delay?: number | null;
	status?: number | null;
}

export const usePatchRouteState = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, patch }: { id: string; patch: RouteStatePatch }) =>
			request(RouteSummary, `/routes/${id}/state`, { method: "PATCH", body: patch }),
		onSuccess: () => invalidateRoutes(qc),
	});
};

export const useSaveScene = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			name,
			envelope,
			etag,
		}: {
			id: string;
			name: string;
			envelope: Envelope;
			etag?: string | null;
		}) =>
			request(SceneDetail, `/routes/${id}/scenes/${encodeURIComponent(name)}`, {
				method: "PUT",
				body: envelope,
				headers: etag ? { "if-match": `"${etag}"` } : undefined,
			}),
		onSuccess: () => invalidateRoutes(qc),
	});
};

export const sceneBodyUrl = (id: string, name: string) =>
	`${API_BASE}/routes/${id}/scenes/${encodeURIComponent(name)}/body`;

/** 文本类 bodyFile 的内容; etag 变化(文件被改)时重新读取 */
export const useSceneBody = (id: string, name: string, etag: string | null, enabled: boolean) =>
	useQuery({
		queryKey: ["scene-body", id, name, etag],
		enabled,
		queryFn: async ({ signal }) => {
			const res = await fetch(sceneBodyUrl(id, name), { signal });
			if (!res.ok) {
				throw new ApiError("HTTP", res.status, `读取文件失败 (${res.status})`);
			}
			return res.text();
		},
	});

export const useSaveSceneBody = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			name,
			text,
			etag,
		}: {
			id: string;
			name: string;
			text: string;
			etag: string | null;
		}) =>
			request(SceneDetail, `/routes/${id}/scenes/${encodeURIComponent(name)}/body`, {
				method: "PUT",
				body: { text },
				headers: etag ? { "if-match": `"${etag}"` } : undefined,
			}),
		onSuccess: () => invalidateRoutes(qc),
	});
};

export const useDeleteScene = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, name, etag }: { id: string; name: string; etag?: string | null }) =>
			request(null, `/routes/${id}/scenes/${encodeURIComponent(name)}`, {
				method: "DELETE",
				headers: etag ? { "if-match": `"${etag}"` } : undefined,
			}),
		onSuccess: () => invalidateRoutes(qc),
	});
};

export interface NewRouteInput {
	methods: string[];
	path: string;
	weight?: number;
	response: Envelope;
}

export const useCreateRoute = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: NewRouteInput) =>
			request(RouteSummary, "/routes", { method: "POST", body: input }),
		onSuccess: () => invalidateRoutes(qc),
	});
};

export const useDeleteRoute = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => request(null, `/routes/${id}`, { method: "DELETE" }),
		onSuccess: () => invalidateRoutes(qc),
	});
};

export const useSetLan = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: { access?: boolean; send?: boolean }) =>
			request(LanInfo, "/lan", { method: "PUT", body }),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.meta }),
	});
};

export const usePatchState = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (patch: {
			enabled?: boolean;
			group?: string | null;
			logLevel?: "silent" | "hit" | "all";
		}) => request(Meta, "/state", { method: "PATCH", body: patch }),
		onSuccess: meta => {
			qc.setQueryData(keys.meta, meta);
			return Promise.all([
				qc.invalidateQueries({ queryKey: keys.routes }),
				qc.invalidateQueries({ queryKey: keys.groups }),
			]);
		},
	});
};

const groupsMutation =
	<V>(fn: (v: V) => Promise<Groups | void>) =>
	() => {
		const qc = useQueryClient();
		return useMutation({
			mutationFn: fn,
			onSuccess: () =>
				Promise.all([
					qc.invalidateQueries({ queryKey: keys.groups }),
					qc.invalidateQueries({ queryKey: keys.meta }),
					qc.invalidateQueries({ queryKey: keys.routes }),
				]),
		});
	};

export const usePutGroup = groupsMutation(
	({ name, map }: { name: string; map: Record<string, string> }) =>
		request(Groups, `/groups/${encodeURIComponent(name)}`, { method: "PUT", body: map })
);
export const useRenameGroup = groupsMutation(({ name, to }: { name: string; to: string }) =>
	request(Groups, `/groups/${encodeURIComponent(name)}/rename`, { method: "POST", body: { to } })
);
export const useDeleteGroup = groupsMutation((name: string) =>
	request(null, `/groups/${encodeURIComponent(name)}`, { method: "DELETE" }).then(() => undefined)
);
export const useSnapshotGroup = groupsMutation(
	({ name, overwrite }: { name: string; overwrite?: boolean }) =>
		request(Groups, `/groups/${encodeURIComponent(name)}/snapshot`, {
			method: "POST",
			body: { overwrite: !!overwrite },
		})
);

export const useCleanup = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const a = await request(Removed, "/state/cleanup", { method: "POST" });
			const b = await request(Removed, "/orphans", { method: "DELETE" });
			return a.removed + b.removed;
		},
		onSuccess: () => qc.invalidateQueries(),
	});
};

export const useClearLogs = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => request(null, "/logs", { method: "DELETE" }),
		onSuccess: () => qc.setQueryData(keys.logs, []),
	});
};

export const useSaveLogAsScene = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			logId,
			name,
			routeId,
			create,
			overwrite,
		}: {
			logId: string;
			name: string;
			routeId?: string;
			create?: { methods: string[]; path: string };
			overwrite?: boolean;
		}) =>
			request(SaveSceneResult, `/logs/${logId}/scene`, {
				method: "POST",
				body: { name, routeId, create, overwrite },
			}),
		onSuccess: () => invalidateRoutes(qc),
	});
};

export const useIgnore = () =>
	useQuery({
		queryKey: keys.ignore,
		queryFn: ({ signal }) => request(IgnoreConfig, "/ignore", { signal }),
	});

export interface IgnorePatch {
	defaults?: boolean;
	disabled?: string[];
	custom?: string[];
}

export const useSaveIgnore = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (patch: IgnorePatch) =>
			request(IgnoreConfig, "/ignore", { method: "PUT", body: patch }),
		onSuccess: data => {
			qc.setQueryData(keys.ignore, data);
		},
	});
};

/** 服务端校验忽略规则, 与实际生效的编译逻辑一致 */
export const validateIgnore = (rules: string[], signal?: AbortSignal) =>
	request(IgnoreValidation, "/ignore/validate", { method: "POST", body: { rules }, signal });

/** 为一条日志生成精确的忽略规则: 方法 + 不含查询串的完整路径 */
export const exactIgnoreRule = (method: string, url: string) =>
	`${method.toUpperCase()} ${url.split(/[?#]/)[0] || "/"}`;

export const KIND_LABEL: Record<LogKind, string> = {
	mock: "mock",
	proxy: "代理",
	pass: "放行",
	miss: "未命中",
	error: "出错",
};

export const useSceneFromSnapshot = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			name,
			snapshot,
			mode,
			overwrite,
		}: {
			id: string;
			name: string;
			snapshot: string;
			mode: "ref" | "copy";
			overwrite?: boolean;
		}) =>
			request(SceneDetail, `/routes/${id}/scenes/${encodeURIComponent(name)}/from-snapshot`, {
				method: "POST",
				body: { snapshot, mode, overwrite },
			}),
		onSuccess: () =>
			Promise.all([invalidateRoutes(qc), qc.invalidateQueries({ queryKey: ["debug"] })]),
	});
};
