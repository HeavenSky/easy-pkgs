import { WifiOff } from "lucide-react";
import { Route, Switch } from "wouter";
import { useLiveEvents } from "./api/live";
import { useMeta } from "./api/queries";
import { Header } from "./components/Header";
import { ErrorState, Spinner } from "./components/ui/state";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { GroupsPage } from "./pages/GroupsPage";
import { LogsPage } from "./pages/LogsPage";
import { RoutesPage } from "./pages/RoutesPage";

export const App = () => {
	const live = useLiveEvents();
	const meta = useMeta();
	if (meta.isPending) { return <Spinner label="正在连接 easy-mok" />; }
	if (meta.isError) { return <ErrorState error={meta.error} onRetry={() => meta.refetch()} />; }
	return (
		<div className="flex h-full flex-col">
			<Header meta={meta.data} live={live} />
			{live === "reconnecting" && (
				<div role="status" className="flex items-center gap-2 bg-amber-100 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
					<WifiOff size={14} />与 dev server 的连接已中断, 正在重连; 期间显示的数据可能已过时.
				</div>
			)}
			<main className="min-h-0 flex-1">
				<Switch>
					<Route path="/logs" component={LogsPage} />
					<Route path="/groups" component={GroupsPage} />
					<Route path="/groups/:name" component={GroupsPage} />
					<Route path="/diagnostics" component={DiagnosticsPage} />
					<Route path="/routes/:id" component={RoutesPage} />
					<Route component={RoutesPage} />
				</Switch>
			</main>
		</div>
	);
};
