// 选项用例的辅助类: fixture 是用例文件所在目录 fixtures.hrx 中的 `<语法>/<文件名>` 条目.
import assert from "node:assert/strict";
import path from "node:path";
import Comb from "../../src/csscomb.ts";
import type { Config } from "../../src/csscomb.ts";
import legacyConfig from "./legacy-config.ts";
import { readFixture } from "./hrx.ts";

export default class OptionTest {
	file: string;
	syntax: string;
	Comb = Comb;
	comb: Comb;

	/**
	 * @param options.warns 用例故意传非法值或未知选项时设为 true: 配置期间桩掉 console.warn,
	 * 并断言确实告警了, 免得告警刷屏.
	 */
	constructor(
		context: Mocha.Context,
		config?: Config | Record<string, unknown>,
		options?: { warns?: boolean }
	) {
		const test = context.test!;
		this.file = test.file!;
		this.syntax = test.parent!.title;

		this.comb = new Comb();
		if (!config) return;
		if (!options?.warns) {
			this.comb.configure(config);
			return;
		}

		const warnings: unknown[][] = [];
		const warn = console.warn;
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};
		try {
			this.comb.configure(config);
		} finally {
			console.warn = warn;
		}
		assert.ok(warnings.length > 0, "Expected configure() to warn about the config");
	}

	// 只支持 `csscomb`, 对应旧版内置预设.
	useConfig(name: "csscomb"): void {
		assert.equal(name, "csscomb");
		this.comb.configure(legacyConfig());
	}

	legacyConfig(): Record<string, any> {
		return legacyConfig();
	}

	getErrors(filename: string) {
		const input = this.readFile(filename);
		return this.comb.lintString(input, { syntax: this.syntax });
	}

	shouldBeEqual(inputFile: string, expectedFile?: string): Promise<void> {
		const input = this.readFile(inputFile);
		const expected = expectedFile ? this.readFile(expectedFile) : input;

		return this.comb
			.processString(input, { syntax: this.syntax })
			.then(string => assert.equal(string, expected));
	}

	/**
	 * Detect options in a file and compare result with expected.
	 * @param options List of options that should be detected
	 * @param input Stylesheet
	 * @param expected Expected config with detected options
	 */
	shouldDetect(options: string[] | undefined, input: string, expected: object): void {
		const detectedConfig = Comb.detectInString(input, options);
		assert.deepEqual(detectedConfig, expected);
	}

	readFile(filename: string): string {
		return readFixture(path.dirname(this.file), path.join(this.syntax, filename));
	}
}
