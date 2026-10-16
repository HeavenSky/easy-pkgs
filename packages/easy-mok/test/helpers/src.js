// 测试与演示服务经 jiti 直接加载 src/server 下的 TS 源码, 无需先构建
"use strict";
const path = require("path");
const { createJiti } = require("jiti");

const jiti = createJiti(__filename);

/** @param {string} [name] src/server 下的模块名, 省略时为入口 */
const loadSrc = name => jiti(path.join(__dirname, "../../src/server", name || "index.ts"));

module.exports = { loadSrc };
