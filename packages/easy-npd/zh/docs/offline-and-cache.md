# 离线安装与管理缓存

[English](../../docs/offline-and-cache.md) · **简体中文**

`--offline` 只用磁盘缓存安装，一个请求都不发；离线安装前，所需的包必须已在缓存里。其他参数控制 npd 如何使用缓存。

## 离线安装

1. 联网时用 `npd` 或 `npd-x install` 把项目装一次。预期：manifest 与 tarball 进入磁盘缓存。
2. 断网后运行 `npd --offline`。预期：只读磁盘缓存，不发任何请求，连源的测速也不做。

- manifest 或 tarball 不在缓存中时立即失败，不重试。
- git 包与 tarball url 依赖离线时总会失败。
- npd 传给安装脚本的二进制镜像设置（`binary-mirror-config` 包）平时从源获取；离线时使用随 npd 安装的那一份。
- `--offline` 不能与 `--no-cache` 同用。

## 选择缓存的使用方式

npd 默认使用磁盘缓存，并联网校验已缓存的 manifest；下面的参数改变这一行为。

| 参数               | 作用                                                 |
| ------------------ | ---------------------------------------------------- |
| `--offline`        | 只读磁盘缓存，不发任何请求；见上文                   |
| `--prefer-offline` | 已缓存的 manifest 不再联网校验；缓存里没有的包才联网 |
| `--refresh-cache`  | 忽略已缓存的 manifest 与 tarball，重新下载并覆盖     |
| `--no-cache`       | 既不用磁盘缓存，也不用测速缓存                       |

- `--production` 与其他安装一样使用磁盘缓存。
- 缓存中损坏的 tarball 会删掉后重新下载。

## 找到缓存位置

缓存目录默认是 `~/.np_tarball`；`np_cache` 或 `npm_config_cache` 可以改变它，两者都设置时以 `np_cache` 为准。

- easy-np 使用同一份 `~/.nprc` 与同一个缓存目录。
- 公共源的 manifest 以 npm 官方源地址为缓存键，各公共源共用。
- `np-probe.json` 保存源的测速结果，见[选择源与网络设置](registry.md#让-npd-自动切换公共源)。
- `npd-node-gyp/` 存放按需安装的 node-gyp，见[在旧版 Node.js 上运行与编译原生模块](node-versions.md)。
- `np-script-logs/<time>-<name>@<version>-<random>.log` 保存每个失败的后台安装脚本的命令与完整输出；报错末尾给出 `script output: <path>`。
- 用 `--no-cache` 时，脚本日志仍写入 `np_cache`、`npm_config_cache` 或 `~/.np_tarball` 指向的目录。
- 超过 7 天的脚本日志在下次写入日志时删除。
