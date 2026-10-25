// 局域网开关的运行时状态: 访问开关的当前值与启动时的初始值, standalone 额外监听的地址与错误
import os from "os";
import { isPrivate } from "./security";

export type LanState = { access: boolean };
export type LanListening = { addresses: string[]; errors: string[] };

/** 本机私有网段的 IPv4 地址; 公网地址不在此列, 局域网开关只对私有网段放行 */
export const privateAddresses = () =>
	Object.values(os.networkInterfaces())
		.flat()
		.filter(i => i && i.family === "IPv4" && !i.internal && isPrivate(i.address))
		.map(i => (i as os.NetworkInterfaceInfo).address);

export const createLanControl = (initial: boolean) => {
	const state: LanState = { access: initial };
	const subscribers = new Set<(state: LanState) => void>();
	let listening: LanListening = { addresses: [], errors: [] };

	return {
		initial,
		get access() {
			return state.access;
		},
		get listening() {
			return listening;
		},
		set: (next: Partial<LanState>) => {
			const before = state.access;
			if (typeof next.access === "boolean") state.access = next.access;
			if (state.access !== before) subscribers.forEach(fn => fn({ ...state }));
		},
		/** 返回取消订阅的函数 */
		subscribe: (fn: (state: LanState) => void) => {
			subscribers.add(fn);
			return () => {
				subscribers.delete(fn);
			};
		},
		setListening: (value: LanListening) => {
			listening = value;
		},
	};
};

export type LanControl = ReturnType<typeof createLanControl>;
