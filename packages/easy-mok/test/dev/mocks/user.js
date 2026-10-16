// 演示用 mock: 多场景, 函数与代理写法
const { scenes } = require("../../../src/server");

module.exports = {
	"GET /api/user/:id": scenes({
		default: { code: 0, data: { id: 1, name: "张三" } },
		empty: { code: 0, data: null },
		vip: { code: 0, data: { id: 1, name: "张三", vip: true } },
		error: (req, res) => res.status(500).json({ code: 500, message: `用户 ${req.params.id} 查询失败` }),
	}),
	"POST /api/login": (req, res) => res.json({ code: 0, data: { token: "t", user: req.body && req.body.name } }),
	"GET /api/list": [{ id: 1, title: "第一条" }, { id: 2, title: "第二条" }],
	"GET /api/upstream/*": () => ({ target: "http://127.0.0.1:4102", pathRewrite: { "^/api/upstream": "" } }),
};
