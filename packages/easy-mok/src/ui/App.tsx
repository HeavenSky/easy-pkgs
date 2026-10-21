import { WifiOff } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useLiveEvents } from "./api/live";
import { useMeta } from "./api/queries";
import { Header } from "./components/Header";
import { ErrorState, Spinner } from "./components/ui/state";

// 页面按路由拆包, 首屏只加载框架与当前页
const loaders = {
	logs: () => import("./pages/LogsPage").then(m => ({ default: m.LogsPage })),
	groups: () => import("./pages/GroupsPage").then(m => ({ default: m.GroupsPage })),
	diagnostics: () =>
		import("./pages/DiagnosticsPage").then(m => ({ default: m.DiagnosticsPage })),
	routes: () => import("./pages/RoutesPage").then(m => ({ default: m.RoutesPage })),
};
const LogsPage = lazy(loaders.logs);
const GroupsPage = lazy(loaders.groups);
const DiagnosticsPage = lazy(loaders.diagnostics);
const RoutesPage = lazy(loaders.routes);

export const App = () => {
	const live = useLiveEvents();
	const meta = useMeta();
	const [location] = useLocation();
	// 等待 meta 期间并行预取当前页, 避免连接成功后再串行拉页面 chunk
	useEffect(() => {
		const page = location.split("/")[1];
		void (
			page === "logs" || page === "groups" || page === "diagnostics"
				? loaders[page]
				: loaders.routes
		)();
	}, [location]);
	if (meta.isPending) {
		return <Spinner label="正在连接 easy-mok" />;
	}
	if (meta.isError) {
		return <ErrorState error={meta.error} onRetry={() => meta.refetch()} />;
	}
	return (
		<div className="flex h-full flex-col">
			<Header meta={meta.data} live={live} />
			{live === "reconnecting" && (
				<div
					role="status"
					className="flex items-center gap-2 bg-amber-100 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
				>
					<WifiOff size={14} />与 dev server 的连接已中断, 正在重连;
					期间显示的数据可能已过时.
				</div>
			)}
			<main className="min-h-0 flex-1">
				<Suspense fallback={<Spinner label="加载页面" />}>
					<Switch>
						<Route path="/logs" component={LogsPage} />
						<Route path="/groups" component={GroupsPage} />
						<Route path="/groups/:name" component={GroupsPage} />
						<Route path="/diagnostics" component={DiagnosticsPage} />
						<Route path="/routes/:id" component={RoutesPage} />
						<Route component={RoutesPage} />
					</Switch>
				</Suspense>
			</main>
		</div>
	);
};
