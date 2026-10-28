/**
 * Easy Graph 的前景图形: 像 Git Graph 视图那样的提交图 —— 竖直的泳道, 分出与合并用 S 形曲线,
 * 提交是环形节点; 再用一颗小星星和两个小圆点做俏皮点缀。
 *
 * 风格与配色对齐作者已发布的 editor-text-toolkit 图标 (同一骨架底座, 纯色无渐变的圆头粗线条)。
 * 底座 (画布尺寸, 圆角, 背景渐变, 描边) 来自 `icon-brand.mjs`, 这里只描述前景。
 * SVG 与 PNG 都由 `scripts/gen-icon.mjs` 从这一份数据生成,
 * 因此不要手写 `media/icon.svg` —— 那会让几何变成两处真源。
 *
 * 渲染器只有折线, 曲线用三次贝塞尔密集采样成折线表示。
 */
import { SIZE, baseShapes } from "./icon-brand.mjs";

const CYAN = "#6FD6FF";
const PINK = "#FF7EB6";
const YELLOW = "#FFC145";
const GREEN = "#4EDD6E";
const PURPLE = "#C792EA";
/** 环形节点中心的颜色, 取底座渐变的中间色, 让节点看起来是空心的。 */
const HOLE = "#232937";

const STROKE = 12;

/** 从 (x1, y1) 竖直出发, 以 S 形曲线到达 (x2, y2) 并竖直进入。 */
function sCurve(x1, y1, x2, y2, steps = 24) {
	const midY = (y1 + y2) / 2;
	const points = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const u = 1 - t;
		const x = u * u * u * x1 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x2;
		const y = u * u * u * y1 + 3 * u * u * t * midY + 3 * u * t * t * midY + t * t * t * y2;
		points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
	}
	return points;
}

const line = (points, stroke) => ({ kind: "polyline", points, stroke, strokeWidth: STROKE });
const commit = (cx, cy, fill) => ({ kind: "ring", cx, cy, outer: 15, inner: 7, fill });
const dot = (cx, cy, r, fill) => ({ kind: "circle", cx, cy, r, fill });
/** 四角小星星: 两条交叉的圆头短线。 */
const sparkle = (cx, cy, size, stroke) => [
	{
		kind: "polyline",
		points: [
			[cx, cy - size],
			[cx, cy + size],
		],
		stroke,
		strokeWidth: 6,
	},
	{
		kind: "polyline",
		points: [
			[cx - size, cy],
			[cx + size, cy],
		],
		stroke,
		strokeWidth: 6,
	},
];

// 泳道的 x 坐标与提交的 y 坐标
const MAIN = 76;
const FEATURE = 132;
const TOPIC = 186;
const MAIN_COMMITS = [52, 128, 204];
const FEATURE_COMMITS = [164, 92];
const TOPIC_COMMIT = 92;

export default {
	size: SIZE,
	label: "Easy Graph",
	shapes: [
		...baseShapes(),
		// 粉色分支: 从主干底部的提交分出, 两个提交后合并回主干顶部的提交
		line(
			[
				...sCurve(MAIN, 204, FEATURE, FEATURE_COMMITS[0]),
				...sCurve(FEATURE, FEATURE_COMMITS[1], MAIN, 52),
			],
			PINK
		),
		// 黄色分支: 从粉色分支的第一个提交分出, 还没合并
		line([...sCurve(FEATURE, FEATURE_COMMITS[0], TOPIC, 124), [TOPIC, TOPIC_COMMIT]], YELLOW),
		// 主干
		line(
			[
				[MAIN, MAIN_COMMITS[0]],
				[MAIN, MAIN_COMMITS[2]],
			],
			CYAN
		),
		// 节点中心先填底色, 再画环, 让线条不从空心处透出来
		...[
			...MAIN_COMMITS.map(y => [MAIN, y]),
			...FEATURE_COMMITS.map(y => [FEATURE, y]),
			[TOPIC, TOPIC_COMMIT],
		].map(([cx, cy]) => dot(cx, cy, 8, HOLE)),
		...MAIN_COMMITS.map(y => commit(MAIN, y, CYAN)),
		...FEATURE_COMMITS.map(y => commit(FEATURE, y, PINK)),
		commit(TOPIC, TOPIC_COMMIT, YELLOW),
		// 俏皮点缀
		...sparkle(200, 50, 10, YELLOW),
		dot(208, 176, 6, GREEN),
		dot(176, 210, 5, PURPLE),
	],
};
