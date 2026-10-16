// 未保存修改的离开确认: 编辑器登记脏状态, 切换路由或页面前询问
import { useEffect } from "react";

let dirty = false;

export const confirmLeave = () => !dirty || window.confirm("有未保存的修改, 确定放弃并离开?");

export const useUnsaved = (isDirty: boolean) => {
	useEffect(() => {
		dirty = isDirty;
		if (!isDirty) { return undefined; }
		const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => {
			dirty = false;
			window.removeEventListener("beforeunload", onBeforeUnload);
		};
	}, [isDirty]);
};
