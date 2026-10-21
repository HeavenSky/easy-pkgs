// 生成内置的 CSS 属性排序清单 src/config/sort-order.ts.
//
// 用法:
//   node scripts/sort-order.ts          重新生成清单
//   node scripts/sort-order.ts --check  只校验清单是否与数据源一致, 不一致时退出码为 1
//
// 顺序基准取 stylelint-config-recess-order 的分组, 缺失的属性由 mdn-data 补齐,
// 两个数据源升级后重跑本脚本即可; 无法自动归位的新属性会让脚本报错, 按提示补进 PLACEMENTS.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import recessGroups from "stylelint-config-recess-order/groups";

const require = createRequire(import.meta.url);
const mdnProperties: Record<string, { status: string }> = require("mdn-data/css/properties.json");

const OUTPUT = fileURLToPath(new URL("../src/config/sort-order.ts", import.meta.url));

// 输出的分段, 段与段之间会被 sort-order 插入空行; 每段按 recess 分组的首个属性认领分组.
const SECTIONS: Array<{ title: string; anchors: string[] }> = [
	{ title: "Cascade", anchors: ["composes", "all"] },
	{ title: "Positioning", anchors: ["position"] },
	{
		title: "Display & layout",
		anchors: ["box-sizing", "columns", "flex", "grid", "gap", "place-content", "order"],
	},
	{
		title: "Box model",
		anchors: [
			"inline-size",
			"padding",
			"anchor-name",
			"contain",
			"overflow",
			"overscroll-behavior",
		],
	},
	{
		title: "Typography",
		anchors: [
			"font",
			"line-height",
			"base-palette",
			"text-align",
			"text-emphasis",
			"ruby-position",
			"src",
			"direction",
		],
	},
	{
		title: "Interaction & content",
		anchors: [
			"appearance",
			"color-scheme",
			"table-layout",
			"content",
			"list-style",
			"scroll-snap-type",
			"scrollbar-color",
			"object-fit",
		],
	},
	{
		title: "Visual",
		anchors: [
			"background",
			"background-blend-mode",
			"filter",
			"clip",
			"shape-outside",
			"text-anchor",
		],
	},
	{
		title: "Motion",
		anchors: [
			"transform",
			"transition",
			"view-transition-name",
			"animation",
			"offset",
			"will-change",
		],
	},
	{ title: "Fragmentation", anchors: ["break-before"] },
];

// 前缀推断不出位置的属性: 插到指定属性之后. 同一锚点下的多个属性按 mdn 名称字典序排列.
const PLACEMENTS: Record<string, string> = {
	"align-tracks": "align-content",
	"baseline-source": "vertical-align",
	"box-align": "display",
	"box-decoration-break": "break-inside",
	"box-direction": "display",
	"box-flex": "display",
	"box-flex-group": "display",
	"box-lines": "display",
	"box-ordinal-group": "display",
	"box-orient": "display",
	"box-pack": "display",
	caret: "caret-color",
	cx: "text-anchor",
	cy: "text-anchor",
	d: "text-anchor",
	"dynamic-range-limit": "image-rendering",
	"field-sizing": "box-sizing",
	"frame-sizing": "box-sizing",
	"hanging-punctuation": "text-indent",
	"hyphenate-limit-chars": "hyphens",
	"ime-mode": "user-select",
	"initial-letter": "text-indent",
	interactivity: "pointer-events",
	"interest-delay": "pointer-events",
	"interpolate-size": "transition-behavior",
	"justify-tracks": "justify-content",
	"line-height-step": "line-height",
	"link-parameters": "image-rendering",
	"masonry-auto-flow": "grid-auto-flow",
	"math-depth": "font-size-adjust",
	"math-shift": "font-size-adjust",
	"math-style": "font-size-adjust",
	"max-lines": "line-clamp",
	"object-view-box": "object-position",
	overlay: "transition-behavior",
	page: "break-inside",
	"page-break-after": "break-inside",
	"page-break-before": "break-inside",
	"page-break-inside": "break-inside",
	"path-length": "text-anchor",
	r: "text-anchor",
	"reading-flow": "order",
	"reading-order": "order",
	"ruby-merge": "ruby-align",
	"ruby-overhang": "ruby-align",
	rx: "text-anchor",
	ry: "text-anchor",
	"scroll-axis-lock": "overscroll-behavior-y",
	"scroll-initial-target": "scroll-snap-type",
	"scroll-marker-group": "scroll-snap-type",
	"scroll-snap-coordinate": "scroll-snap-stop",
	"scroll-snap-destination": "scroll-snap-stop",
	"scroll-snap-points-x": "scroll-snap-stop",
	"scroll-snap-points-y": "scroll-snap-stop",
	"scroll-target-group": "scroll-snap-type",
	"scroll-timeline": "animation-composition",
	"speak-as": "list-style-image",
	"stroke-color": "stroke",
	"text-autospace": "text-indent",
	"text-box": "vertical-align",
	"text-fit": "text-indent",
	"text-size-adjust": "text-indent",
	"text-spacing-trim": "text-indent",
	"timeline-scope": "animation-composition",
	"timeline-trigger": "animation-composition",
	"trigger-scope": "animation-composition",
	"vector-effect": "text-anchor",
	"view-timeline": "animation-composition",
	"view-transition-scope": "view-transition-class",
	"window-drag": "user-select",
	x: "text-anchor",
	y: "text-anchor",
	// 只有前缀写法的属性.
	"-moz-user-focus": "user-select",
	"-moz-user-input": "user-select",
	"-moz-user-modify": "user-select",
	"-ms-scroll-chaining": "overscroll-behavior-y",
	"-ms-scroll-rails": "overscroll-behavior-y",
	"-ms-scroll-snap-x": "scroll-snap-stop",
	"-ms-scroll-snap-y": "scroll-snap-stop",
	"-ms-scrollbar-3dlight-color": "scrollbar-width",
	"-ms-scrollbar-arrow-color": "scrollbar-width",
	"-ms-scrollbar-base-color": "scrollbar-width",
	"-ms-scrollbar-darkshadow-color": "scrollbar-width",
	"-ms-scrollbar-face-color": "scrollbar-width",
	"-ms-scrollbar-highlight-color": "scrollbar-width",
	"-ms-scrollbar-shadow-color": "scrollbar-width",
	"-ms-scrollbar-track-color": "scrollbar-width",
	"-ms-touch-select": "user-select",
	"-webkit-box-reflect": "backdrop-filter",
	"-webkit-tap-highlight-color": "user-select",
	"-webkit-touch-callout": "user-select",
	"-webkit-user-modify": "user-select",
};

const VENDOR_PREFIX = /^-(webkit|khtml|moz|ms|o)-/;
// 排除 recess 里 `filter:progid:...` 这类 IE 滤镜写法, 它们不是属性名.
const isPropertyName = (name: string) => /^-?[a-z][a-z0-9-]*$/.test(name);
const isPrefixed = (name: string) => VENDOR_PREFIX.test(name);
const unprefix = (name: string) => name.replace(VENDOR_PREFIX, "");

function buildSections(): string[][] {
	const sectionOf = new Map<string, number>();
	SECTIONS.forEach((section, i) => section.anchors.forEach(a => sectionOf.set(a, i)));

	const sections: string[][][] = SECTIONS.map(() => []);
	for (const group of recessGroups) {
		const first = group.properties[0];
		const index = sectionOf.get(first);
		if (index === undefined)
			throw new Error(`recess 新增了以 "${first}" 开头的分组, 请在 SECTIONS 中归段.`);
		sections[index].push(group.properties.filter(isPropertyName));
	}

	const groups = sections.flat();
	const known = new Set(groups.flat());
	const missing = Object.keys(mdnProperties)
		.filter(name => isPropertyName(name) && !isPrefixed(name) && !known.has(name))
		// 先放短名, 使 `caret` 归位后 `caret-shape` 能按前缀跟上它.
		.sort((a, b) => byLength(a, b) || a.localeCompare(b));

	const stale = Object.keys(PLACEMENTS).filter(name => known.has(name));
	if (stale.length)
		throw new Error(`recess 已收录以下属性, 请从 PLACEMENTS 中删除: ${stale.join(", ")}`);

	const unplaced: string[] = [];
	for (const name of missing) {
		const anchor = PLACEMENTS[name] ?? findPrefixAnchor(name, groups);
		if (!anchor || !insertAfter(groups, anchor, name)) unplaced.push(name);
	}
	if (unplaced.length) {
		throw new Error(
			`以下属性无法自动归位, 请在 PLACEMENTS 中指定锚点:\n  ${unplaced.join("\n  ")}`
		);
	}

	// sort-order 会把带前缀属性定位到其标准名处, 只有标准名不存在时才需要显式列出前缀写法.
	const standard = new Set(groups.flat().filter(name => !isPrefixed(name)));
	for (const group of groups) {
		const kept = group.filter(name => !isPrefixed(name) || !standard.has(unprefix(name)));
		group.splice(0, group.length, ...kept);
	}

	const listed = new Set(groups.flat());
	const legacy: string[] = [];
	const prefixedOnly = Object.keys(mdnProperties).sort(
		(a, b) => byLength(unprefix(a), unprefix(b)) || a.localeCompare(b)
	);
	for (const name of prefixedOnly) {
		if (!isPrefixed(name) || listed.has(name) || standard.has(unprefix(name))) continue;
		const anchor = PLACEMENTS[name] ?? findPrefixAnchor(unprefix(name), groups);
		if (anchor) insertAfter(groups, anchor, name);
		else legacy.push(name);
	}

	const result: string[][] = [];
	let offset = 0;
	for (const section of sections) {
		result.push(groups.slice(offset, offset + section.length).flat());
		offset += section.length;
	}
	if (legacy.length) result.push(legacy.sort());
	return result;
}

const byLength = (a: string, b: string) => a.split("-").length - b.split("-").length;

// 逐级去掉末段找到一个本身就是已知属性的前缀, 锚点取同组内最后一个以该前缀开头的属性;
// 比较时忽略厂商前缀, 使 `-ms-grid-rows` 能跟上已归位的 `-ms-grid-columns`.
function findPrefixAnchor(name: string, groups: string[][]): string | undefined {
	const parts = name.split("-");
	for (let k = parts.length - 1; k > 0; k--) {
		const prefix = parts.slice(0, k).join("-");
		const group = groups.find(g => g.some(p => unprefix(p) === prefix));
		if (!group) continue;
		return group
			.filter(p => {
				const base = unprefix(p);
				return base === prefix || base.startsWith(prefix + "-");
			})
			.at(-1);
	}
}

function insertAfter(groups: string[][], anchor: string, name: string): boolean {
	const group = groups.find(g => g.includes(anchor));
	if (!group) return false;
	let i = group.indexOf(anchor) + 1;
	// 同一锚点后已插入的属性按字典序排, 保证结果与插入先后无关.
	while (i < group.length && PLACEMENTS[group[i]] === anchor && group[i] < name) i++;
	group.splice(i, 0, name);
	return true;
}

function render(sections: string[][]): string {
	const body = sections
		.map((properties, i) =>
			[
				`  // ${SECTIONS[i]?.title ?? "Legacy vendor-only properties"}`,
				"  [",
				properties.map(p => `    '${p}'`).join(",\n"),
				"  ]",
			].join("\n")
		)
		.join(",\n");

	return [
		"// 由 scripts/sort-order.ts 生成, 不要手改; 调整顺序请改脚本后重新生成.",
		"const sortOrder: string[][] = [",
		body,
		"];",
		"",
		"export default sortOrder;",
		"",
	].join("\n");
}

const output = render(buildSections());

if (process.argv.includes("--check")) {
	let current = "";
	try {
		current = readFileSync(OUTPUT, "utf8");
	} catch {}
	if (current !== output) {
		console.error("src/config/sort-order.ts 与数据源不一致, 请运行 `npm run sort-order`.");
		process.exit(1);
	}
} else {
	writeFileSync(OUTPUT, output);
	console.log(`已写入 ${OUTPUT}`);
}
