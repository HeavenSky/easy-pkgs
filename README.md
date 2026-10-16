# easy-pkgs

本仓库接手并持续维护停更或偏离方向的开源 npm 包: 每个包放在 `packages/<名称>/`, 各自安装依赖, 测试, 版本与发布, 不共享代码. 新接手一个项目, 或要在本仓库开发时读本页; 各包的用法见其 README, 上游来源以 [`upstreams.json`](./upstreams.json) 为准.

| 包                                            | 用途                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| [`easy-np`](./packages/easy-np/README.md)     | npm 包安装工具(`np`, `np-x`), `.store` 布局, 支持 npm workspaces            |
| [`easy-npd`](./packages/easy-npd/README.md)   | npm 包安装工具(`npd`, `npd-x`), `_name@version@name` 扁平布局              |
| [`easy-comb`](./packages/easy-comb/README.md) | CSS / Less / Sass / SCSS 代码风格格式化与属性排序(csscomb)                 |
| [`easy-gonz`](./packages/easy-gonz/README.md) | CSS / Less / Sass / SCSS 解析器(gonzales-pe), easy-comb 内置其构建产物     |
| [`easy-mok`](./packages/easy-mok/README.md) | 开发期 mock 中间件与图形化管理页(自研, 非接手项目)                    |

## 接手流程

1. 确认停更: 用 `gh` 查看上游最后发布与推送时间, 维护者是否回应 issue, 以及是否已有活跃 fork; 已有人在系统性维护的 fork 时优先参与该 fork, 不另起一份.
2. 导入: 在 dev 分支执行 `npm run adopt -- <名称> <来源> [--ref <分支, tag 或提交>] [--upstream <owner/repo>]`. 来源可以是 GitHub 的 `owner/repo`, git 地址或本地仓库路径(只导入已提交的内容); 来源不是 GitHub 上游时用 `--upstream` 指明, 供第 6 步跟踪. 只导入该提交的文件快照, 上游提交历史留在上游仓库, 确切的提交号登记在 `upstreams.json` 的 `base`. 名称取简短的项目名, 去掉 `.js`, `-pe` 这类后缀.
3. 筛选: 逐个看上游开放的 issue 与 PR, 以及各 fork 领先上游的提交; 有价值且改动小的直接修复并补用例, 其余记入 `.ai-ctx/TODO.md`(只在本地, 不入库; 条目以 `[包名]` 开头).
4. 现代化: 移除过时的依赖, polyfill 与构建链, 补测试; 破坏性变更写进包内 `CHANGELOG.md`.
5. 发布: 沿用原包名需要原维护者转让 npm 所有权, 否则改用自己 scope 下的包名; 存在破坏性变更时从上游最后版本升主版本. 首次发布前按「发布」一节登记 Trusted Publisher.
6. 跟踪: 定期执行 `npm run upstream -- --mark`, 查看上游自上次检查以来的新提交, 发布, PR 与 issue(依赖升级机器人的 PR 只计数); 上游的修复按需移植.

## 开发

各包不启用 npm workspaces: 依赖版本会互相冲突, 依赖提升也会掩盖漏声明的依赖.

各包根目录的 `package-lock.json` 入库, CI, 官方测试集与发布一律 `npm ci`, 缺 lockfile 或与 `package.json` 不一致即失败. 增删或升级依赖后重新生成并与 `package.json` 一起提交:

- 先删掉该包的 `node_modules` 再 `npm i --registry=https://registry.npmjs.org/`: 只删 lockfile 时 npm 会沿用 `node_modules/.package-lock.json` 里的旧下载地址, 镜像地址写进 lockfile 后 CI 会从镜像下载.
- `easy-np` 与 `easy-npd` 加 `--lockfile-version=2`: 它们的 CI 在 Node 14(npm 6)上 `npm ci`, npm 6 读不了 v3 lockfile.
- 不要在 `easy-np` / `easy-npd` 目录放 `.npmrc`: 经 `npm` / `npx` 运行测试时其中的配置会传给被测的安装器, 例如 `package-lock=false` 会让 np-lock 相关用例失败.

```bash
npm run install:all          # 在每个包目录下按 lockfile 执行 npm ci
npm test                     # 依次执行每个包的 test
npm test -- easy-np          # 只执行指定的包
npm run lint                 # 依次执行每个包的 lint, 没有该脚本的包跳过
npm run build
```

- 每个包 MUST 提供 `test` 脚本; `lint:check` 与 `build` 有则由 CI 执行. 根目录的这些命令由 `scripts/each.mjs` 在各包内依次执行.
- 不发布的内部包放在 `packages/_<名称>/`, `package.json` 写 `"private": true`: CI 通用 job 跳过 `_` 开头的目录, `release.yml` 拒绝发布 private 包; 目前只有 `_official_style_suites`(包名 `official-style-suites`, 官方样式测试集的下载, 抽取与判定, 见下文 CI 一节).
- 一个修复要同时用到多个包时, 分别修改并分别提交, 不抽公共代码.
- 版本号, `CHANGELOG.md` 与发布各自独立.

### 测试数据

适用于各包 `test/` 下被 git 跟踪的文件; 接手新包时, 上游测试目录 MUST 先按本节整理并通过预算检查, 再合入 main.

- 入库: 被用例引用的最小输入与期望输出; 必须以真实文件存在才能测的行为(被测代码按路径读取的目录, 配置文件, 符号链接以外的安装 fixture, CI 直接引用的样例); 由脚本生成, 排好序的已知失败基线.
- 不入库: 没有被任何用例引用的文件; 能按版本下载的第三方语料(登记到 `packages/_official_style_suites/suites.json`, 缓存到 `.cache/`); 能由入库数据确定性生成的产物(tarball, 符号链接等, 测试时生成, 生成物加入 `.gitignore`); 运行产物与缓存.
- 合并: 同一用例集中按内容读取的小文本 fixture 超过约 50 个时, 合并成归档或语料文件, 并附一次逐条无损核对. 格式只用两种: 多个原样文件用 HRX(见 easy-comb 的 `test/helpers/hrx.ts`), 输入加结构化期望用语料 txt(见 easy-gonz 的 `test/corpus.js`, 必须提供 `--update` 重写期望). 读取器各包自带, 不在根目录共享运行时代码.
- 大文件: 单个文本文件超过 256KB, 二进制文件超过 64KB 时, 优先改格式, 改为生成或下载; 确需保留的登记到 `test-budget.json` 的 `allow` 并写明理由. 录制的快照类数据按"一条记录一行"写回, 使每次刷新的 diff 可审阅.
- 换行: 含原始 CR 或要求逐字节保留的测试数据在 `.gitattributes` 中标 `-text`, 二进制标 `binary`.
- 预算: CI 的 `test-budget` job 执行 `npm run budget`, 统计各包 `test/` 的文件数与字节数, 超过 `test-budget.json` 中的预算即失败. 放宽预算要在同一提交中修改 `test-budget.json` 并在提交信息中写明理由; 瘦身后同步收紧.

## CI

`.github/workflows/ci.yml` 自动发现 `packages/*`: 除 `easy-np`, `easy-npd` 与 `_` 开头的内部包外, 每个包走通用 job, 在 Node 24 上依次执行 `lint:check`, `typecheck`, `test`, `build`(没有的脚本跳过). `easy-np` 与 `easy-npd` 不走通用 job, 改由专用 job 覆盖 Python, Node 14 至 24 与 Windows; `easy-comb`, `easy-gonz` 与 `easy-mok` 在通用 job 之外另有旧版 Node 冒烟 job, 验证各自 `engines` 下限. 某个包需要更多 Node 版本或平台时, 为它加专用 job; 不再需要通用 job 时把它从 `discover` 的列表中排除. 各 workflow 的 token 只有只读权限, PR 上被新推送取代的运行会被取消, main 上的不取消(release.yml 依赖它的结果).

`.github/workflows/official.yml` 用各语法的官方测试集(WPT, css-parsing-tests, sass-spec, less.js test-data)检验 easy-gonz 与 easy-comb: 语料按 `packages/_official_style_suites/suites.json` 钉死的版本下载到 `.cache/official/`, 不入库; 各包的 `test/official-baseline.json` 记录已知失败, 出现新失败即不通过, 修好的用例要在同一改动中执行 `npm run test:official -- --update` 移出基线.

## 发布

推送 `<包目录名>@<版本>` 形式的 tag 后, `.github/workflows/release.yml` 校验 tag 与 `packages/<包目录名>/package.json` 的 `version` 一致, 等待同一提交在 main 上的 CI 通过(不重复跑 lint 与单测, CI 未通过或该提交没推到 main 时不发布); 包有 `build` 脚本时先安装依赖并构建; 打包用 `npm pack --ignore-scripts`, 不执行任何生命周期脚本; `files` 中声明了 `npm-shrinkwrap.json` 的包(easy-np, easy-npd)由 `scripts/shrinkwrap.mjs` 从 lockfile 去掉开发依赖后生成并打进包, 用户用 npm 安装时整棵依赖树按已测版本解析; 再发布到 npm, 并以 CHANGELOG 中该版本的段落创建 GitHub Release; 带 `-` 的预发布版本发布到 dist-tag `next`.

```bash
# 先改好 version 与 CHANGELOG 并提交
git tag easy-np@0.0.5
git push origin main easy-np@0.0.5
```

npm 登录走 Trusted Publishing, 不需要 `NPM_TOKEN`: 每个包需在 npmjs.com 的 Settings → Trusted Publisher 中登记一次 GitHub Actions, 仓库 `HeavenSky/easy-pkgs`, 工作流 `release.yml`.

- 新包名的首个版本必须在本机 `npm login` 后 `npm publish --access public`: npm 只能给已存在的包登记 Trusted Publisher, 不支持先登记再由 CI 首发(npm/cli#8544). 登记后 2 天内要完成一次 OIDC 发布, 否则配置过期.
- 登记的仓库与 `package.json` 的 `repository.url` 都必须是当前仓库名; 仓库改名后要在每个已登记的包上改过来, 否则 release.yml 的发布会失败.

## 分支

- `main` 只放整理好的核心改动, 一个提交对应一项完整的工作; 发布 tag 打在 main 上.
- `dev` 只在本地使用, 可以随意细碎提交; 一项工作完成后用 `git merge --squash dev` 合入 main 并写好提交信息, 再执行 `git branch -f dev main` 让 dev 从新的 main 继续.
- 不在 main 上直接提交零碎改动, 也不把 dev 推送到远端.
- 各包的上游提交历史不在本仓库; 需要追溯时到 `upstreams.json` 登记的上游仓库, 从 `base` 提交往前查.

## easy-np 与 easy-npd

两个包的代码分别起源于 [cnpm/npminstall](https://github.com/cnpm/npminstall) 8.0.1(easy-np)与 6.8.0(easy-npd); 与 npminstall 的差异与移除项见各包的 `docs/migrate-from-npminstall.md`.

`np-x install` / `npd-x install` 贴近 npm 与 pnpm: 默认读写 `np-lock.json`, 依赖脚本按 `allowScripts` 放行, 兼容读取 `.npmrc`, `pnpm-workspace.yaml` 与 `package.json` 的 `pnpm` 字段. `np` / `npd` 与之完全相同, 只是固定补上 `--no-lockfile --dangerously-allow-all-scripts`, 这两个参数只能在命令行覆盖. 两个包的命令名互不冲突, 可以同时全局安装: `npm i -g easy-np easy-npd`; npm 不支持从 git 仓库子目录安装.

### 共用缓存与配置

- 用户配置: 两个包读取同一份 `~/.nprc`(registry, scope registry 与认证).
- 磁盘缓存: 两个包共用 `~/.np_tarball`, 可用 `np_cache` 或 `npm_config_cache` 改写. 用其中一个装过的包, 另一个安装时直接命中缓存.
- 缓存文件: manifest 存为 `np-manifests/<name>/<md5(manifest url)>.json`, 公共源统一按官方源的 manifest 地址计算; tgz 存为 `np-tgz/<name>/<version>-<shasum>.tgz`.
- 测速缓存: 公共源测速结果存为 `~/.np_tarball/np-probe.json`, 两个包共用.
- node-gyp: 两个包都不自带 node-gyp, 首次编译原生模块时按当前 Node.js 版本安装到 `~/.np_tarball/np-node-gyp`(easy-np)与 `~/.np_tarball/npd-node-gyp`(easy-npd), 两者各自独立, 不互相读取.
- 锁文件: 两个包读写项目根目录同一份 `np-lock.json`, 格式见各包 `lib/np_lock.js`.
- 同步修改: 改任一个包的缓存路径, 文件名, manifest 缓存, 测速缓存或 `np-lock.json` 的 JSON 结构时, MUST 同步修改另一个包; 否则两者会静默读到对方写入的不兼容文件.

### 开发约定

- 两个包的脚本名一致: `test`, `test-cov`, `lint`(带 `--fix`), `lint:check`, `fmt`(带 `--write`), `fmt:check`.
- 测试按功能放在 `test/<目录>/` 下一层, 支持文件在 `test/support/`; package.json 与 CI 的 mocha spec 写作 `test/*/*.test.js`, 不能写成 `test/**`: fixtures 中依赖包自带的 `*.test.js` 会被当作用例; spec 也不能放进 `.mocharc.js`, 否则命令行指定单个文件时会与它合并成全量.
