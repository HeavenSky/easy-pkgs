# 选择源与网络设置

[English](../../docs/registry.md) · **简体中文**

公共源不需要任何配置：npd 自动挑最快的几个并在它们之间切换；只有私有网络或受限网络才需要设置源、代理或 CA。

## 选择源

安装用的源取以下第一个有设置的：`-r, --registry=<url>`、环境变量 `npm_registry`、`~/.nprc` 的 `registry`，最后是 `.npmrc` 的 `registry` 或 `npm_config_registry`。

- scope 源依次取 `~/.nprc`、`.npmrc` 中的 `@scope:registry`。
- 两个入口都按这个顺序；例如项目 `.npmrc` 写了私有源时，`npd` 与 `npd-x install` 都从私有源安装。
- `.npmrc` 的查找方式见[配置 npd](configuration.md)。

## 让 npd 自动切换公共源

没有设置私有源时，npd 在 5 个公共源之间选择：npm（`registry.npmjs.org`）、yarn（`registry.yarnpkg.com`）、alibaba（`registry.npmmirror.com`）、tencent（`mirrors.tencent.com/npm`）与 huawei（`mirrors.huaweicloud.com/repository/npm`）。

- 测速：启动时向各源同时请求同一个小文件，按返回先后留下最先返回的 3 个；不足 3 个时按上面的顺序补足。
- 测速结果保存在缓存目录的 `np-probe.json` 中，缓存目录默认是 `~/.np_tarball`，与 easy-np 共用。默认 5 分钟内复用结果；`--probe-cache=<minutes>` 或 `np_probe_cache` 修改时长，`0` 表示每次都测速。
- 重试：manifest 或 tarball 请求失败时换到 3 个源中的下一个，最多循环 2 轮，连同首次最多 6 次。
- 镜像同步滞后：镜像的 manifest 里没有要安装的版本时，改从 npm 获取。
- 指定 5 个公共源之一时它排第一；npd 照常测速，其余 2 个位置按测速结果排。
- 指定其他源时关闭切换；只为某个 scope 指定源时，只关闭这个 scope 的切换。
- `--offline` 与 `--prefer-offline` 不测速：有指定的源时它排第一，其余按上面的列表顺序。
- 各公共源共用同一份缓存，换源不会重复下载。

### 二进制下载

安装脚本下载二进制文件或 Node.js 头文件时，在 npmmirror 二进制镜像与官方地址之间选择。

- 没有指定源时，npd 在测速公共源的同时测速这两者，先用较快的那个。
- 失败时两者交替，连同首次最多 4 次。
- 指定了公共源，或者没有测速时，二进制跟随排第一的源：npm 与 yarn 走官方地址，其余走镜像。

## 凭据只发给对应的源

npd 只把源的凭据发给配置它的那个 host。

- `.npmrc` 中某个源的 `_authToken`，以及 `~/.nprc` 中某个源的用户名与密码，只发给与该源同 host 的请求。
- `always-auth` 不会把凭据发给其他 host。
- 凭据会在报错、告警、`npd-debug.log` 与 debug 输出中替换为 `***`，包括：URL 里的凭据（`user:pass@`），`_authToken`、`_auth`、`_password` 的值，以及 `token`、`access_token`、`auth`、`_authToken`、`password` 等查询参数的值。

## 使用代理或自定义 CA

代理与证书设置可以用参数传入，也可以让 npd 从环境中读取；npd 还会把它们交给自己启动的进程。

| 参数                                   | 作用                                             |
| -------------------------------------- | ------------------------------------------------ |
| `--proxy=<url>`、`--https-proxy=<url>` | http / https 代理                                |
| `--noproxy=<host>[,<host>]`            | 不走代理的 host                                  |
| `--cafile=<file>`                      | https 请求使用的 CA 证书；相对路径按当前目录解析 |
| `--strict-ssl`、`--no-strict-ssl`      | 是否校验证书，默认校验                           |

- 没有传代理参数时，依次读取 `npm_config_*`、`~/.nprc`，最后是 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`（小写形式同样识别）。
- npd 把同一份代理、CA 与证书设置传给安装脚本、node-gyp 与 git。
- 命令行传 `--strict-ssl` 时，覆盖环境中继承的 `npm_config_strict_ssl=false`，并为子进程清除 `GIT_SSL_NO_VERIFY`。

## 限制包的来源

下面两个参数让安装直接失败，而不是接受你不想要的包。

| 参数                                         | 作用                           |
| -------------------------------------------- | ------------------------------ |
| `--registry-only`                            | 有包来自 git 或远程 url 时失败 |
| `--forbidden-licenses=<license>[,<license>]` | 有包使用这些许可证时失败       |

## 了解下载如何校验

npd 按 `dist.integrity` 中最强的算法校验每个来自源的 tarball，通常是 sha512。
