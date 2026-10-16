# 用 np-lock.json 锁定版本

[English](../../docs/lockfile.md) · **简体中文**

`np-lock.json` 锁住每个解析出的版本，让 CI 装出的正是你测过的那一套；`npd-x install` 默认开启锁文件，`npd` 默认关闭，传 `--lockfile` 才开启。

## 在 CI 中严格按锁文件安装

1. 在本地运行 `npd-x install`。预期：项目根目录生成 `np-lock.json`；提交它。
2. 在 CI 中运行 `npd-x install --frozen-lockfile`。预期：只安装锁文件记录的内容，不写回锁文件。
3. 如果 `package.json` 声明的某个依赖不在锁文件里，安装失败并报 `<pkg> is not in np-lock.json, run npd-x install to update it`；回到第 1 步重新生成并提交。

`--frozen-lockfile` 不能与包名同用，且要求已存在 `np-lock.json`。

## 开启或关闭锁文件

`npd-x install` 默认使用锁文件；下面的参数只改变单次运行。

| 参数                          | 作用                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `--lockfile`、`--no-lockfile` | 是否读写 `np-lock.json`；默认开启，`npd` 固定补上 `--no-lockfile`                    |
| `--frozen-lockfile`           | 只按 `np-lock.json` 安装，缺少条目时报错，从不写回；视为开启锁文件                   |
| `--from-package-lock=<file>`  | 按 `package-lock.json`（lockfileVersion 2 及以上）锁定的版本安装，忽略其中的可选依赖 |

取第一个有设置的来源：

1. 命令行的 `--lockfile` / `--no-lockfile`，包括 `npd` 补上的 `--no-lockfile`
2. `--frozen-lockfile`，视为开启
3. 环境变量 `np_lockfile`
4. `package.json` 的 `config.np.lockfile`
5. pnpm 设置与 `.npmrc` 中的 `lockfile`、`package-lock`
6. 默认：开启

即使开启了锁文件，项目已有其他包管理器的锁文件而没有 `np-lock.json` 时也不生成；用 `--from-package-lock` 或 `-g` 时不读写 `np-lock.json`。

## 了解 np-lock.json 记录什么

`np-lock.json` 把每条依赖声明（`name@spec`）映射到它解析出的版本，下次安装直接复用；easy-np 读写同一份文件。

- 每次安装都按锁文件遍历整棵依赖树：任何一层的已装版本与锁定版本不同时，都换成锁定版本。
- 已经装好的包不重新下载，也不重跑脚本。
- 完整安装只保留本次用到的条目；带 `<pkg>`、`--only`、`--omit`，或跳过了非标准字段的安装只追加条目。
- 根 `package.json` 有 `workspaces` 时只追加条目，保留 easy-np 记录的成员条目。
- `npd <pkg>` 按保存进 `package.json` 的声明记录；命令行写 tag、写 `*` 或不写版本时，每次都重新解析。
- git 依赖锁定到 commit，检出时不再执行 `git ls-remote`；tarball url 依赖锁定 sha512 integrity，tarball 内容变化时报错；本地目录依赖不锁定。
- URL 中的凭据从不写进锁文件；按锁文件安装时凭据取自 `package.json` 中的声明。
- `npd-x update` 忽略锁定的版本，重新解析范围并写回。
