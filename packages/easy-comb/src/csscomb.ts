// 对外入口: 预装全部内置选项的 Comb, 以及配置读取与选项检测的静态方法.
import fs from "node:fs";
import gonzales from "easy-gonz";
import type { Node, Syntax } from "easy-gonz";
import Comb from "./core.ts";
import { findConfigFile, loadConfigFile } from "./config.ts";
import type { Config } from "./config.ts";
import defaultConfig from "./config/default.ts";
import format from "./format.ts";
import type { OptionDefinition } from "./option.ts";
import options from "./options/index.ts";

export { CONFIG_FILES, defineConfig } from "./config.ts";
export type { Config } from "./config.ts";
export type { LintError, OptionDefinition } from "./option.ts";
export { Comb };

interface Handler {
	name: string;
	detect: (ast: Node) => unknown[];
	detectDefault?: unknown;
}

export default class CSScomb extends Comb {
	/**
	 * @param config 配置对象, 或内置配置名(目前只有 `csscomb`).
	 */
	constructor(config?: string | Config | Record<string, unknown>) {
		super();
		options.forEach(option => this.use(option));

		if (typeof config === "string") config = CSScomb.getConfig(config);
		if (typeof config === "object") this.configure(config);
	}

	/**
	 * Detects the options in the given file
	 *
	 * @param file Path to the stylesheet
	 * @param options List of options to detect
	 * @returns Detected options
	 */
	static detectInFile(file: string, options?: string[]): Config {
		const stylesheet = fs.readFileSync(file, "utf8");
		return CSScomb.detectInString(stylesheet, options);
	}

	/**
	 * Detects the options in the given string
	 *
	 * @param text Stylesheet
	 * @param options List of options to detect
	 * @returns Detected options
	 */
	static detectInString(text: string, options?: string[]): Config {
		if (!text) return {};

		const handlers = getHandlers(options);
		const tree = cssToAST(text);
		const detectedOptions = detectInTree(tree, handlers);
		const result = getDetectedOptions(detectedOptions, handlers);

		// Indentation is handled by `block-indent`, keep only the newline:
		if (typeof result["block-indent"] === "string") {
			["space-after-opening-brace", "space-between-declarations"].forEach(name => {
				const value = result[name];
				if (typeof value === "string" && value.indexOf("\n") > -1) result[name] = "\n";
			});
		}

		return result as Config;
	}

	/**
	 * 返回内置默认配置的副本.
	 *
	 * @param name 内置配置名, 缺省或 `csscomb` 时返回默认配置
	 */
	static getConfig(name?: string): Config {
		const DEFAULT_CONFIG_NAME = "csscomb";
		name = name || DEFAULT_CONFIG_NAME;

		if (typeof name !== "string") {
			throw new Error("Config name must be a string.");
		}

		if (name !== DEFAULT_CONFIG_NAME) {
			throw new Error(
				format(`"${name}" is not a valid config name. Try
                       '${DEFAULT_CONFIG_NAME}'.`)
			);
		}

		// 配置只含 JSON 数据; 不用 structuredClone 以兼容 Node 16.
		return JSON.parse(JSON.stringify(defaultConfig));
	}

	/**
	 * Gets configuration from provided config path or looks for it in common
	 * places.
	 *
	 * @returns 加载失败或找不到时返回 null
	 */
	static async getCustomConfig(configPath?: string): Promise<Config | null> {
		const file = configPath || CSScomb.getCustomConfigPath();
		if (!file) return null;

		try {
			return await loadConfigFile(file);
		} catch {
			return null;
		}
	}

	/**
	 * Looks for a config file: recursively from current (process) directory
	 * up to $HOME dir
	 * If no custom config file is found, return `null`.
	 */
	static getCustomConfigPath(configPath?: string): string | null {
		return findConfigFile(configPath);
	}
}

/**
 * Gets options' data needed for detection
 */
function getHandlers(names?: string[]): Handler[] {
	return options
		.filter((option: OptionDefinition) => !names || names.indexOf(option.name) > -1)
		.filter(option => typeof option.detect === "function")
		.map(option => ({
			name: option.name,
			detect: option.detect!,
			detectDefault: option.detectDefault,
		}));
}

/**
 * Converts CSS string to AST.
 */
function cssToAST(text: string, syntax?: string, filename?: string): Node {
	const fileInfo = filename ? " at " + filename : "";

	try {
		return gonzales.parse(text, { syntax: syntax as Syntax });
	} catch (e) {
		throw new Error("Parsing error" + fileInfo + ": " + (e as Error).message, { cause: e });
	}
}

/**
 * Processes tree and detects options.
 *
 * @returns Map with detected options and all variants of possible values
 */
function detectInTree(tree: Node, handlers: Handler[]): Record<string, unknown[]> {
	const detectedOptions: Record<string, unknown[]> = {};
	// We walk across complete tree for each handler,
	// because we need strictly maintain order in which handlers work,
	// despite fact that handlers work on different level of the tree.
	handlers.forEach(handler => {
		detectedOptions[handler.name] = handler.detect(tree);
	});
	return detectedOptions;
}

/**
 * Gets the detected options.
 */
function getDetectedOptions(
	detected: Record<string, unknown[]>,
	handlers: Handler[]
): Record<string, unknown> {
	const options: Record<string, unknown> = {};
	Object.keys(detected).forEach(option => {
		// List of all the detected variants from the stylesheet
		// for the given option:
		const values = detected[option];
		if (!values.length) {
			// If there are no values for the option, check if there is
			// a default one:
			for (let i = handlers.length; i--;) {
				if (handlers[i].name === option && handlers[i].detectDefault !== undefined) {
					options[option] = handlers[i].detectDefault;
					break;
				}
			}
		} else if (values.length === 1) {
			options[option] = values[0];
		} else {
			// If there are more than one value for the option, find
			// the most popular one; `variants` would be populated
			// with the popularity for different values.
			const variants: Record<string, number> = {};
			let bestGuess: unknown = null;
			let maximum = 0;
			for (let i = values.length; i--;) {
				const currentValue = values[i];
				const key = String(currentValue);
				// Count the current value:
				variants[key] = (variants[key] || 0) + 1;
				// If the current variant is the most popular one, treat
				// it as the best guess:
				if (variants[key] >= maximum) {
					maximum = variants[key];
					bestGuess = currentValue;
				}
			}
			if (bestGuess !== null) {
				options[option] = bestGuess;
			}
		}
	});

	return options;
}
