// 把选项定义包装成带取值校验的插件实例.
import type { Node } from "easy-gonz";
import Errors from "./errors.ts";
import type { Accepts, LintError, OptionDefinition } from "./option.ts";

export default class Plugin {
	name!: string;
	syntax!: string[];
	accepts?: Accepts;
	runBefore?: string;
	setValue?: (value: unknown) => unknown;
	process?: (ast: Node, config: Record<string, unknown>) => void;
	lint?: (ast: Node, config: Record<string, unknown>) => LintError[];
	detect?: (ast: Node) => unknown[];
	detectDefault?: unknown;
	[member: string]: unknown;

	private value_: any = null;

	constructor(option: OptionDefinition) {
		// 选项上的私有辅助方法也要拷过来, 它们通过 `this` 互相调用.
		Object.assign(this, option);
		this.validate();
	}

	get value(): any {
		return this.value_;
	}

	set value(value: unknown) {
		const valueType = typeof value;
		const pattern = this.accepts && this.accepts[valueType as keyof Accepts];

		if (this.setValue) {
			this.value_ = this.setValue(value);
			return;
		}

		if (!pattern) throw new Error(Errors.unacceptableValueType(valueType, this.accepts));

		if (valueType === "boolean") {
			if ((pattern as boolean[]).indexOf(value as boolean) < 0)
				throw new Error(Errors.unacceptableBoolean(pattern as boolean[]));
			this.value_ = value;
			return;
		}

		if (valueType === "number") {
			if (value !== parseInt(String(value))) throw new Error(Errors.unacceptableNumber());
			this.value_ = " ".repeat(value as number);
			return;
		}

		if (valueType === "string") {
			if (!(value as string).match(pattern as RegExp))
				throw new Error(Errors.unacceptableString(pattern as RegExp));
			this.value_ = value;
			return;
		}

		throw new Error(Errors.implementSetValue(valueType));
	}

	validate(): void {
		if (typeof this.name !== "string" || !this.name) throw new Error(Errors.missingName());

		if (!Array.isArray(this.syntax) || this.syntax.length === 0)
			throw new Error(Errors.missingSyntax());

		if (typeof this.accepts !== "object" && typeof this.setValue !== "function")
			throw new Error(Errors.missingSetValue());
	}
}
