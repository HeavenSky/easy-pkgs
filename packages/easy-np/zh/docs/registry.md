# 选择源、代理与缓存

[English](../../docs/registry.md) · **简体中文**

不做任何源设置时，easy-np 按速度在 5 个公共源之间切换；改用私有源、代理、CA 证书或离线缓存都只需一个参数，两个入口都适用。

## 使用源与网络参数

| 参数                                         | 含义                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `-r, --registry=<url>`                       | 指定安装源；未传时依次取 `npm_registry`、`~/.nprc`、`.npmrc` / `npm_config_registry`；5 个公共源仍自动测速切换，指定其他源时关闭切换 |
| `--probe-cache=<minutes>`                    | 复用上次测速结果的时长，默认 5，`0` 表示每次测速                                                                                     |
| `--proxy=<url>`、`--https-proxy=<url>`       | http / https 代理，同时传给安装脚本、node-gyp 与 git                                                                                 |
| `--noproxy=<host>[,<host>]`                  | 不走代理的 host                                                                                                                      |
| `--cafile=<file>`                            | https 请求使用的 CA 证书，相对路径按当前目录解析                                                                                     |
| `--strict-ssl`、`--no-strict-ssl`            | 是否校验证书，默认校验；`--strict-ssl` 覆盖环境中继承的 `npm_config_strict_ssl=false`                                                |
| `--registry-only`                            | 有包来自 git 或远程 URL 时失败                                                                                                       |
| `--forbidden-licenses=<license>[,<license>]` | 有包使用这些许可证时失败                                                                                                             |

未传代理参数时，依次读取 `npm_config_*`、`~/.nprc`、`HTTP_PROXY` 等变量（含小写形式）；见[配置 easy-np](configuration.md)。

## 使用缓存参数

| 参数               | 含义                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `--offline`        | 只读磁盘缓存，不发任何请求（含测速）；不支持 git 包与 tarball URL 依赖 |
| `--prefer-offline` | 有缓存的 manifest 不联网校验，缓存中没有的包才联网                     |
| `--refresh-cache`  | 忽略已有的 manifest 与 tgz 缓存，重新下载并覆盖                        |
| `--no-cache`       | 不使用磁盘缓存与测速缓存；不能与 `--offline` 同用                      |

## 让 easy-np 切换公共源

未指定私有源时，easy-np 在以下 5 个公共源之间选择：npm（`registry.npmjs.org`）、yarn（`registry.yarnpkg.com`）、alibaba（`registry.npmmirror.com`）、tencent（`mirrors.tencent.com/npm`）、huawei（`mirrors.huaweicloud.com/repository/npm`）。

- 「指定」源的方式包括 `--registry`、`npm_registry`、`~/.nprc` 与 `.npmrc` / `npm_config_registry`；例如项目 `.npmrc` 写了私有源时，两个入口都改从私有源安装。
- 指定 5 个公共源之一时它排第一，其余 2 个仍按测速。
- 指定私有源时完全关闭切换；为某个 scope 单独指定源时只关闭这个 scope 的切换。
- 选源：每次运行开始时同时请求各源上的同一个小文件，按先后记住最先返回的 3 个源；不足 3 个时按上面的顺序补足。结果保存在 `~/.np_tarball/np-probe.json`（与 easy-npd 共用），默认 5 分钟内复用。
- 换源重试：manifest 或 tgz 请求失败时按这 3 个源的先后逐个重试，最多循环 2 轮，连同首次最多 6 次。
- 二进制源：只在 npmmirror 二进制镜像与官方地址之间选择，同样按测速决定先后。依赖的安装脚本下载二进制文件或 Node.js 头文件失败时两者交替重试，连同首次最多 4 次。因指定了公共源或离线而不测速时，二进制跟随排第一的源：npm 与 yarn 走官方地址，其余走镜像。
- 镜像同步滞后：镜像的 manifest 里没有要安装的版本时，改从 npm 官方源获取。

## 缓存放在哪里

- easy-np 与 easy-npd 共用 `~/.nprc` 与磁盘缓存 `~/.np_tarball`；各公共源共用同一份缓存，换源不重复下载。
- 后台执行的依赖脚本失败时，命令与完整输出写入缓存目录下的 `np-script-logs/<time>-<name>@<version>-<random>.log`，报错末尾给出该路径。
- `--no-cache` 时，这些日志依次写入 `np_cache`、`npm_config_cache` 或 `~/.np_tarball`。
- 超过 7 天的日志在下次写入日志时删除。
- 缓存中损坏的 tgz 会被删除并重新下载。
