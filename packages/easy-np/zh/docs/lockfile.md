# 用 np-lock.json 锁定版本

[English](../../docs/lockfile.md) · **简体中文**

`np-lock.json` 让安装可复现，CI 也不会漂移；请用 `np-x install`，因为 `np` 关闭了锁文件（[选择 np 还是 np-x install](install.md#选择-np-还是-np-x-install)）。

## 在 CI 中锁定项目

1. 先用 `np-x install` 安装一次（默认开启锁文件）。应看到：输出以 `np np-lock.json updated` 结尾，项目根目录出现 `np-lock.json`。
2. 把 `np-lock.json` 与 `package.json` 一起提交。
3. 在 CI 中只按锁文件安装：`np-x install --frozen-lockfile`。应看到：在 `np-lock.json` 中没有条目的依赖报 `<pkg> is not in np-lock.json, run np-x install to update it` 并失败。

## 使用锁文件参数

| 参数                          | 含义                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `--lockfile`、`--no-lockfile` | 读写 `np-lock.json` 与否，默认开；`np` 固定补上 `--no-lockfile`                    |
| `--frozen-lockfile`           | 只按 `np-lock.json` 安装，缺少条目时报错，不写回；不能与包名同用                   |
| `--from-package-lock=<file>`  | 按 `package-lock.json`（lockfileVersion >= 2）中锁定的版本安装，忽略其中的可选依赖 |

## np-lock.json 记录什么

- 安装成功后在项目根目录（workspace 项目为 workspace 根）写入 `np-lock.json`，记录每个依赖声明（`name@spec`）解析出的版本，再次安装直接复用。
- easy-npd 读写同一份文件。
- 是否启用锁文件取以下第一个有配置的：`--lockfile` / `--no-lockfile` > `--frozen-lockfile`（视为开启）> `np_lockfile` > `config.np.lockfile` > pnpm 与 `.npmrc` 的 `lockfile`、`package-lock` > 默认开。`np` 补上的 `--no-lockfile` 属于命令行。
- 完整安装只保留本次用到的条目。
- 以下安装只追加条目：带 `<pkg>`、在 workspace 目录中运行、带 `--workspaces`/`--only`/`--omit` 运行，以及跳过了非标准字段的安装。
- 已安装版本与锁定版本不同时，easy-np 直接换成锁定版本；`np-x update` 忽略锁定版本，按范围重新解析并写回。
- `np <pkg>` 记录的是写进 `package.json` 的那条声明；命令行上写的 tag、`*` 或不写版本，每次安装都重新解析。
- 项目已有其他包管理器的锁文件且没有 `np-lock.json` 时，不生成 `np-lock.json`。
- 使用 `--from-package-lock` 或 `-g` 时，不读写 `np-lock.json`。
- git 依赖锁定 commit，tarball URL 依赖锁定 sha512 integrity，本地目录依赖不锁定。
- URL 中的凭据不写进锁文件。

## 按 npm 的 package-lock.json 安装

`--from-package-lock=<file>` 按 npm `package-lock.json` 中锁定的版本安装，适合从 npm 迁移过来的项目。

- 文件的 lockfileVersion 必须 >= 2；easy-np 忽略其中列出的可选依赖。
- workspace 项目读取 npm 生成的 workspace lockfile，各 workspace 按其中锁定的版本安装。
- 文件加载失败时报错退出，不改为联网解析。
