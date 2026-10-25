// 局域网开关的运行时状态: 访问与代发开关的当前值, 访问开关的初始值, standalone 额外监听的地址与错误
import os from "os";
import { isPrivate } from "./security";

/** send: 允许局域网设备经调试页代发请求, 依赖 access */
export type LanState = { access: boolean; send: boolean };
export type LanListening = { addresses: string[]; errors: string[] };

/** 本机私有网段的 IPv4 地址; 公网地址不在此列, 局域网开关只对私有网段放行 */
export const privateAddresses = () =>
	Object.values(os.networkInterfaces())
		.flat()
		.filter(i => i && i.family === "IPv4" && !i.internal && isPrivate(i.address))
		.map(i => (i as os.NetworkInterfaceInfo).address);

export const createLanControl = (initial: boolean) => {
	const state: LanState = { access: initial, send: false };
	const subscribers = new Set<(state: LanState) => void>();
	let listening: LanListening = { addresses: [], errors: [] };

	return {
		initial,
		get access() {
			return state.access;
		},
		get send() {
			return state.send;
		},
		get listening() {
			return listening;
		},
		/** 关闭访问时一并关闭代发 */
		set: (next: Partial<LanState>) => {
			const before = { ...state };
			if (typeof next.access === "boolean") state.access = next.access;
			if (typeof next.send === "boolean") state.send = next.send;
			if (!state.access) state.send = false;
			if (state.access !== before.access || state.send !== before.send) {
				subscribers.forEach(fn => fn({ ...state }));
			}
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
