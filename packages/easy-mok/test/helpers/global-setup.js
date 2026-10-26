// 测试前后清理 test/.tmp 下的临时 mock 目录
"use strict";
const fs = require("fs");
const path = require("path");

const TMP_ROOT = path.join(__dirname, "..", process.env.EASY_MOK_TEST_TMP || ".tmp");

module.exports = () => {
	fs.rmSync(TMP_ROOT, { recursive: true, force: true });
	return () => fs.rmSync(TMP_ROOT, { recursive: true, force: true });
};
