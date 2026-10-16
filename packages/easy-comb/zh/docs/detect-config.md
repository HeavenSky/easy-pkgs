# 从样式表生成配置

[English](../../docs/detect-config.md) · **简体中文**

这页讲怎样把你满意的样式表风格直接变成配置，不用手写；前提是已经[装好 easy-comb](install.md)。
除 `sort-order` 外，所有选项都能检测。

## 生成配置文件

```bash
csscomb -d example.css > .csscomb.json
```

生成的文件包含 easy-comb 能从 `example.css` 中检测到的所有选项；之后像普通[配置文件](configuration.md)一样修改即可。

## 把样式表直接当配置

```bash
csscomb -c example.css assets/css
```

`--config` 的路径以 `.css` 结尾时，easy-comb 每次运行都重新检测它的风格，而不是当作配置文件加载。

## 用 template 补齐未设置的选项

```json
{
    "template": "example.css",
    "leading-zero": false,
    "vendor-prefix-align": true
}
```

设置 `template` 后，凡是配置里没写的选项，都取该样式表中检测到的值；这样配置里只需写你想改的几项。
`template` 路径相对配置文件所在目录，无论在哪个目录运行 `csscomb`，指向的都是同一个文件。
`template` 指向的文件不存在时报 `Template configuration file <path> was not found.` 并停止。
只有 `csscomb` 命令读取 `template`，[Node.js API](node-api.md#静态方法) 会忽略它。
