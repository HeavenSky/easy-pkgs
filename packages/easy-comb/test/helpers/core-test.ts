// 核心用例的辅助类: fixture 是上一级目录 fixtures.hrx 中的 `<用例目录名>/<文件名>` 条目.
import assert from "node:assert/strict";
import path from "node:path";
import Comb from "../../src/csscomb.ts";
import type { Config } from "../../src/csscomb.ts";
import legacyConfig from "./legacy-config.ts";
import { readFixture } from "./hrx.ts";

export default class CoreTest {
	file: string;
	syntax: string;
	Comb = Comb;
	comb: Comb;

	constructor(context: Mocha.Context, config?: Config | Record<string, unknown>) {
		const test = context.test!;
		this.file = test.file!;
		this.syntax = test.parent!.title;

		this.comb = new Comb();
		if (config) this.comb.configure(config);
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
	 * @param input Name of template file
	 * @param expected Expected config with detected options
	 */
	shouldDetect(options: string[] | undefined, input: string, expected: object): void {
		const detectedConfig = Comb.detectInString(input, options);
		assert.deepEqual(detectedConfig, expected);
	}

	readFile(filename: string): string {
		const dirname = path.dirname(this.file);
		return readFixture(path.dirname(dirname), path.join(path.basename(dirname), filename));
	}
}
