// 调试页的查询与变更钩子; 变更成功后失效 ["debug"] 下的全部缓存
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { request } from "./client";
import {
	DebugRequest,
	DebugTree,
	EnvGroup,
	EnvList,
	Resolved,
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
