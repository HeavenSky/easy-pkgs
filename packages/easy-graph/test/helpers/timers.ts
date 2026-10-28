import { type MockInstance, vi } from 'vitest';

/**
 * 用例按 Jest legacy 假定时器的语义编写: 断言 `expect(setTimeout).toHaveBeenCalledWith(...)`,
 * 要求定时器函数本身是 mock; 同时 `mocks/date.ts` 自行替换 `Date`, 所以不能让假定时器伪造 Date。
 * vitest 的假定时器不会把 setTimeout 变成 mock, 这里在假定时器之上再套一层 spy。
 */
const FAKED_TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] as const;

let timerSpies: MockInstance[] = [];

export function useFakeTimers() {
	restoreTimerSpies();
	vi.useFakeTimers({ toFake: [...FAKED_TIMERS] });
	timerSpies = FAKED_TIMERS.map((name) => vi.spyOn(globalThis, name));
}

export function useRealTimers() {
	// 先撤掉 spy (全局回到假定时器), 再让 vitest 把全局恢复成真实定时器
	restoreTimerSpies();
	vi.useRealTimers();
}

function restoreTimerSpies() {
	timerSpies.forEach((spy) => spy.mockRestore());
	timerSpies = [];
}
