// 调试页的查询与变更钩子; 变更成功后失效 ["debug"] 下的全部缓存
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { z } from "zod";
import { API_BASE, request } from "./client";
import {
	DebugRequest,
	DebugTree,
	EnvGroup,
	EnvList,
	HistoryDays,
	HistoryEntry,
	HistoryPage,
	DiffResult,
	RefreshResult,
	Resolved,
	SnapshotDetail,
	SnapshotSummary,
	SecretItem,
	TreeNode,
	encodeId,
	type Definition,
} from "./debug-contract";

export const debugKeys = {
	all: ["debug"] as const,
	tree: ["debug", "tree"] as const,
	request: (id: string) => ["debug", "request", id] as const,
	envs: ["debug", "envs"] as const,
	secrets: (env: string) => ["debug", "secrets", env] as const,
	resolve: (key: unknown) => ["debug", "resolve", key] as const,
};

const ifMatch = (etag?: string | null) => (etag ? { "if-match": `"${etag}"` } : undefined);

const useDebugMutation = <V, R>(fn: (v: V) => Promise<R>) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () => qc.invalidateQueries({ queryKey: debugKeys.all }),
	});
};

export const useDebugTree = () =>
	useQuery({ queryKey: debugKeys.tree, queryFn: ({ signal }) => request(DebugTree, "/debug/tree", { signal }) });

export const useDebugRequest = (id: string | null) =>
	useQuery({
		queryKey: debugKeys.request(id || ""),
		enabled: !!id,
		queryFn: ({ signal }) => request(DebugRequest, `/debug/requests/${encodeId(id!)}`, { signal }),
	});

export const useCreateNode = () =>
	useDebugMutation(
		(body: { parent: string | null; kind: "group" | "request"; name: string; title?: string; weight?: number }) =>
			request(TreeNode, "/debug/nodes", { method: "POST", body })
	);

export const useUpdateNode = () =>
	useDebugMutation(
		({
			id,
			patch,
			etag,
		}: {
			id: string;
			patch: { name?: string; parent?: string | null; title?: string | null; weight?: number; vars?: Record<string, string> };
			etag?: string | null;
		}) =>
			request(TreeNode, `/debug/nodes/${encodeId(id)}`, { method: "PATCH", body: patch, headers: ifMatch(etag) })
	);

export const useDeleteNode = () =>
	useDebugMutation(({ id, recursive }: { id: string; recursive?: boolean }) =>
		request(null, `/debug/nodes/${encodeId(id)}${recursive ? "?recursive=1" : ""}`, { method: "DELETE" })
	);

export const useSaveRequest = () =>
	useDebugMutation(({ id, definition, etag }: { id: string; definition: Definition; etag?: string | null }) =>
		request(DebugRequest, `/debug/requests/${encodeId(id)}`, {
			method: "PUT",
			body: { definition },
			headers: ifMatch(etag),
		})
	);

export const useEnvs = () =>
	useQuery({ queryKey: debugKeys.envs, queryFn: ({ signal }) => request(EnvList, "/debug/envs", { signal }) });

export const useSaveEnv = () =>
	useDebugMutation(
		({ name, body, etag }: { name: string; body: { title?: string | null; weight?: number; vars?: Record<string, string> }; etag?: string | null }) =>
			request(EnvGroup, `/debug/envs/${encodeURIComponent(name)}`, { method: "PUT", body, headers: ifMatch(etag) })
	);

export const useRenameEnv = () =>
	useDebugMutation(({ name, to }: { name: string; to: string }) =>
		request(EnvGroup, `/debug/envs/${encodeURIComponent(name)}`, { method: "PATCH", body: { name: to } })
	);

export const useDeleteEnv = () =>
	useDebugMutation((name: string) => request(null, `/debug/envs/${encodeURIComponent(name)}`, { method: "DELETE" }));

export const useSetActiveEnv = () =>
	useDebugMutation((name: string | null) =>
		request(z.object({ active: z.string().nullable() }), "/debug/active-env", { method: "PUT", body: { name } })
	);

export const useSecrets = (env: string | null) =>
	useQuery({
		queryKey: debugKeys.secrets(env || ""),
		enabled: !!env,
		queryFn: ({ signal }) =>
			request(z.array(SecretItem), `/debug/envs/${encodeURIComponent(env!)}/secrets`, { signal }),
	});

export const useSaveSecret = () =>
	useDebugMutation(
		({ env, id, source }: { env: string; id: string; source: { from: "value"; value: string } | { from: "env"; name: string } }) =>
			request(SecretItem, `/debug/envs/${encodeURIComponent(env)}/secrets/${encodeURIComponent(id)}`, {
				method: "PUT",
				body: source,
			})
	);

export const useDeleteSecret = () =>
	useDebugMutation(({ env, id }: { env: string; id: string }) =>
		request(null, `/debug/envs/${encodeURIComponent(env)}/secrets/${encodeURIComponent(id)}`, { method: "DELETE" })
	);

export const useResolve = (input: { request: string | null; definition: Definition } | null) =>
	useQuery({
		queryKey: debugKeys.resolve(input),
		enabled: !!input,
		queryFn: ({ signal }) => request(Resolved, "/debug/resolve", { method: "POST", body: input, signal }),
	});

/** definition 省略时使用已保存的请求定义 */
export type SendInput = { request: string | null; definition?: Definition; env?: string | null; snapshot?: string | null };

/** 发送请求; cancel() 中止进行中的发送, 服务端随之取消并记为 ABORTED */
export const useSend = () => {
	const qc = useQueryClient();
	const ctrl = useRef<AbortController | null>(null);
	const mutation = useMutation({
		mutationFn: (input: SendInput) => {
			ctrl.current = new AbortController();
			return request(HistoryEntry, "/debug/send", { method: "POST", body: input, signal: ctrl.current.signal });
		},
		onSettled: () => qc.invalidateQueries({ queryKey: ["debug", "history"] }),
	});
	return { ...mutation, cancel: () => ctrl.current?.abort() };
};

export const historyRawUrl = (id: string) => `${API_BASE}/debug/history/${encodeId(id)}/raw`;

/** request 为 undefined 时列出全部历史 */
export const useHistory = (requestId: string | undefined) =>
	useInfiniteQuery({
		queryKey: ["debug", "history", "list", requestId ?? null],
		initialPageParam: null as string | null,
		queryFn: ({ pageParam, signal }) => {
			const q = new URLSearchParams({ limit: "30" });
			if (requestId) q.set("request", requestId);
			if (pageParam) q.set("cursor", pageParam);
			return request(HistoryPage, `/debug/history?${q}`, { signal });
		},
		getNextPageParam: last => last.next,
	});

export const useHistoryEntry = (id: string | null) =>
	useQuery({
		queryKey: ["debug", "history", "entry", id],
		enabled: !!id,
		queryFn: ({ signal }) => request(HistoryEntry, `/debug/history/${encodeId(id!)}`, { signal }),
	});

export const useHistoryDays = () =>
	useQuery({ queryKey: ["debug", "history", "days"], queryFn: ({ signal }) => request(HistoryDays, "/debug/history-days", { signal }) });

export const useDeleteDay = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (day: string) => request(null, `/debug/history-days/${day}`, { method: "DELETE" }),
		onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["debug", "history"] }), qc.invalidateQueries({ queryKey: ["meta"] })]),
	});
};

export const snapshotRawUrl = (sid: string) => `${API_BASE}/debug/snapshots/${encodeId(sid)}/raw`;

export const useSaveSnapshot = () =>
	useDebugMutation(
		({ hid, body }: { hid: string; body: { request: string; name: string; title?: string; weight?: number; overwrite?: boolean } }) =>
			request(SnapshotSummary, `/debug/history/${encodeId(hid)}/snapshot`, { method: "POST", body })
	);

export const useSnapshot = (sid: string | null) =>
	useQuery({
		queryKey: ["debug", "snapshot", sid],
		enabled: !!sid,
		queryFn: ({ signal }) => request(SnapshotDetail, `/debug/snapshots/${encodeId(sid!)}`, { signal }),
	});

export const useUpdateSnapshot = () =>
	useDebugMutation(
		({ sid, patch }: { sid: string; patch: { name?: string; title?: string | null; weight?: number; vars?: Record<string, string>; replay?: { setCookie: boolean } } }) =>
			request(SnapshotSummary, `/debug/snapshots/${encodeId(sid)}`, { method: "PATCH", body: patch })
	);

export const useDeleteSnapshot = () =>
	useDebugMutation(({ sid, force }: { sid: string; force?: boolean }) =>
		request(null, `/debug/snapshots/${encodeId(sid)}${force ? "?force=1" : ""}`, { method: "DELETE" })
	);

export const useSnapshotRefs = (sid: string | null) =>
	useQuery({
		queryKey: ["debug", "snapshot-refs", sid],
		enabled: !!sid,
		queryFn: ({ signal }) =>
			request(z.array(z.object({ route: z.string(), scene: z.string(), file: z.string() })), `/debug/snapshots/${encodeId(sid!)}/refs`, { signal }),
	});

export const useRouteMatch = (requestId: string | null, enabled: boolean) =>
	useQuery({
		queryKey: ["debug", "route-match", requestId],
		enabled: !!requestId && enabled,
		queryFn: ({ signal }) =>
			request(
				z.object({ pathname: z.string(), candidates: z.array(z.object({ routeId: z.string(), key: z.string() })) }),
				`/debug/requests/${encodeId(requestId!)}/route-match`,
				{ signal }
			),
	});

/** a, b 取 snapshot:<快照标识> 或 history:<历史标识> */
export const useDiff = (a: string | null, b: string | null) =>
	useQuery({
		queryKey: ["debug", "diff", a, b],
		enabled: !!a && !!b,
		queryFn: ({ signal }) =>
			request(DiffResult, `/debug/diff?${new URLSearchParams({ a: a!, b: b! })}`, { signal }),
	});

export const useRefreshSnapshot = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (sid: string) => request(RefreshResult, `/debug/snapshots/${encodeId(sid)}/refresh`, { method: "POST", body: {} }),
		onSettled: () => qc.invalidateQueries({ queryKey: ["debug", "history"] }),
	});
};

const Warnings = z.array(z.string());

export const useImportCurl = () =>
	useDebugMutation((body: { text: string; parent: string | null; name?: string }) =>
		request(z.object({ node: TreeNode, warnings: Warnings }), "/debug/import/curl", { method: "POST", body })
	);

export const useImportOpenApi = () =>
	useDebugMutation((body: { text: string; parent: string | null; env: string | null; snapshots: boolean }) =>
		request(z.object({ created: z.number(), warnings: Warnings }), "/debug/import/openapi", { method: "POST", body })
	);

export const useExportCurl = () =>
	useMutation({
		mutationFn: (body: { source: string; resolve: boolean }) =>
			request(z.object({ text: z.string() }), "/debug/export/curl", { method: "POST", body }),
	});

export const useExportOpenApi = () =>
	useMutation({
		mutationFn: (body: { node: string | null; format: "yaml" | "json" }) =>
			request(z.object({ text: z.string(), filename: z.string(), warnings: Warnings }), "/debug/export/openapi", { method: "POST", body }),
	});

export const useLogToRequest = () =>
	useDebugMutation(({ logId, parent, name }: { logId: string; parent: string | null; name?: string }) =>
		request(z.object({ node: TreeNode, warnings: Warnings }), `/logs/${logId}/debug-request`, { method: "POST", body: { parent, name } })
	);
