/* easy-mok 悬浮条入口: 保持 ES3 写法, 旧浏览器(IE8-11)中自检后静默退出 */
(function () {
	var w = window;
	var d = document;
	if (w.__MOCK_FLOAT__ || !w.fetch || !w.Promise || !d.documentElement || !d.documentElement.attachShadow) {
		return;
	}
	w.__MOCK_FLOAT__ = 1;
	var cur = d.currentScript;
	var base = cur && cur.src ? cur.src.replace(/float\.js(\?.*)?$/, "") : "/__mock/";
	w.__MOCK_BASE__ = base;
	var s = d.createElement("script");
	s.src = base + "ui/float.js";
	s.async = true;
	s.onerror = function () {
		if (w.console) { w.console.warn("[easy-mok] 悬浮条加载失败, 管理页可能未构建"); }
	};
	(d.body || d.documentElement).appendChild(s);
})();
