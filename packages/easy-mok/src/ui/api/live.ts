// SSE 订阅: 数据变更时失效缓存, 日志实时追加; 服务重启(bootId 变化)后全量刷新
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { API_BASE, onBootId } from "./client";
import { LogSummary } from "./contract";
import { invalidateRoutes, keys, LOG_LIMIT } from "./queries";

export type LiveStatus = "connecting" | "open" | "reconnecting";

export const useLiveEvents = () => {
	const qc = useQueryClient();
	const [status, setStatus] = useState<LiveStatus>("connecting");
	const bootRef = useRef<string | null>(null);

	useEffect(
		() =>
			onBootId(boot => {
				if (bootRef.current && bootRef.current !== boot) {
					qc.invalidateQueries();
				}
				bootRef.current = boot;
			}),
		[qc]
	);

	useEffect(() => {
		const source = new EventSource(`${API_BASE}/events`);
		let hitTimer: ReturnType<typeof setTimeout> | null = null;
		let wasDown = false;
		source.onopen = () => {
			setStatus("open");
			if (wasDown) {
				qc.invalidateQueries();
			}
			wasDown = false;
		};
		source.onerror = () => {
			wasDown = true;
			setStatus("reconnecting");
		};
		source.addEventListener("changed", event => {
			const { scope } = JSON.parse((event as MessageEvent).data) as { scope: string };
			if (scope === "routes") {
				invalidateRoutes(qc);
			}
			if (scope === "state") {
				qc.invalidateQueries({ queryKey: keys.meta });
				qc.invalidateQueries({ queryKey: keys.routes });
				qc.invalidateQueries({ queryKey: ["route"] });
			}
			if (scope === "groups") {
				qc.invalidateQueries({ queryKey: keys.groups });
				qc.invalidateQueries({ queryKey: keys.routes });
				qc.invalidateQueries({ queryKey: keys.meta });
			}
			if (scope === "logs") {
				qc.invalidateQueries({ queryKey: keys.logs });
			}
			if (scope === "ignore") {
				qc.invalidateQueries({ queryKey: keys.ignore });
			}
		});
		source.addEventListener("log", event => {
			const parsed = LogSummary.safeParse(JSON.parse((event as MessageEvent).data));
			if (!parsed.success) {
				return;
			}
			qc.setQueryData<LogSummary[]>(keys.logs, prev => {
				if (!prev) {
					return prev;
				}
				const next = [...prev, parsed.data];
				return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
			});
			if (parsed.data.routeId && !hitTimer) {
				// 命中次数随日志变化, 合并到每秒一次刷新
				hitTimer = setTimeout(() => {
					hitTimer = null;
					qc.invalidateQueries({ queryKey: keys.routes });
				}, 1000);
			}
		});
		return () => {
			if (hitTimer) clearTimeout(hitTimer);
			source.close();
		};
	}, [qc]);

	return status;
};
