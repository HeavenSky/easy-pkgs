# easy-pkgs

本仓库接手停更或偏离方向的开源 npm 包与 VS Code 插件, 在原项目基础上修复问题并扩充功能后持续维护: 每个包放在 `packages/<名称>/`, 各自安装依赖, 测试, 版本与发布, 不共享代码. 新接手一个项目, 或要在本仓库开发时读本页; 各包的用法见其 README, 上游仓库与接手时的提交以 [`upstreams.json`](./upstreams.json) 为准.

### npm 包

| 包                                            | 用途                                                               | npm 源包                                                         |
| --------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [`easy-np`](./packages/easy-np/README.md)     | npm 包安装工具(`np`, `np-x`), `.np` 布局, 支持 npm workspaces      | [`npminstall`](https://www.npmjs.com/package/npminstall) 8.0.1   |
| [`easy-npd`](./packages/easy-npd/README.md)   | npm 包安装工具(`npd`, `npd-x`), `.npd/_name@version@name` 扁平布局 | [`npminstall`](https://www.npmjs.com/package/npminstall) 6.8.0   |
| [`easy-comb`](./packages/easy-comb/README.md) | CSS / Less / Sass / SCSS 代码风格格式化与属性排序                  | [`csscomb`](https://www.npmjs.com/package/csscomb) 4.3.0         |
| [`easy-gonz`](./packages/easy-gonz/README.md) | CSS / Less / Sass / SCSS 解析器, easy-comb 依赖它                  | [`gonzales-pe`](https://www.npmjs.com/package/gonzales-pe) 4.3.0 |
| [`easy-mok`](./packages/easy-mok/README.md)   | 开发期 mock 中间件与图形化管理页                                   | 无, 自研                                                         |

### VS Code 插件

| 插件                                            | 用途                                                                         | VS Code 源插件                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`easy-graph`](./packages/easy-graph/README.md) | Git 提交图: 查看全部分支, 标签与暂存, 并在图上 rebase, merge, cherry-pick 等 | [Git Graph 2](https://marketplace.visualstudio.com/items?itemName=hansu.git-graph-2) 1.31.8 |

VS Code 插件与 npm 包的差异:

- 构建与安装: 在包目录执行 `npm run package` 打出 `artifacts/<名称>-<版本>.vsix`, 用 `code --install-extension <vsix> --force` 安装; 工程结构, 门禁与打包断言沿用 `~/.ai-rules/patterns/vsc-ext/` 骨架.
- 发布: 同样推送 `<包目录名>@<版本>` tag, 由 `release.yml` 打包 vsix 并发布到 VS Code Marketplace 与 Open VSX, 见「发布」一节; 版本号不能带 `-` 后缀, 预发布版改用 vsce 的 `--pre-release`.

## 接手流程

1. 确认停更: 用 `gh` 查看上游最后发布与推送时间, 维护者是否回应 issue, 以及是否已有活跃 fork; 已有人在系统性维护的 fork 时优先参与该 fork, 不另起一份.
2. 导入: 在 dev 分支执行 `npm run adopt -- <名称> <来源> [--ref <分支, tag 或提交>] [--upstream <owner/repo>]`. 来源可以是 GitHub 的 `owner/repo`, git 地址或本地仓库路径(只导入已提交的内容); 来源不是 GitHub 上游时用 `--upstream` 指明, 供第 6 步跟踪. 只导入该提交的文件快照, 上游提交历史留在上游仓库, 确切的提交号登记在 `upstreams.json` 的 `base`. 名称取简短的项目名, 去掉 `.js`, `-pe` 这类后缀.
3. 筛选: 逐个看上游开放的 issue 与 PR, 以及各 fork 领先上游的提交; 有价值且改动小的直接修复并补用例, 其余记入 `.ai-ctx/TODO.md`(只在本地, 不入库; 条目以 `[包名]` 开头).
4. 现代化: 移除过时的依赖, polyfill 与构建链, 补测试; 破坏性变更写进包内 `CHANGELOG.md`.
5. 发布: 先核对上游许可证是否允许分发衍生作品, 不允许时只在本机使用(见「VS Code 插件」的发布说明); 沿用原包名需要原维护者转让 npm 所有权, 否则改用自己 scope 下的包名; 存在破坏性变更时从上游最后版本升主版本. 首次发布前按「发布」一节登记 Trusted Publisher.
6. 跟踪: 定期执行 `npm run upstream -- --mark`, 查看上游自上次检查以来的新提交, 发布, PR 与 issue(依赖升级机器人的 PR 只计数); 上游的修复按需移植.

## 开发

各包不启用 npm workspaces: 依赖版本会互相冲突, 依赖提升也会掩盖漏声明的依赖.

仓库根目录与各包根目录的 `package-lock.json` 都入库(根目录的只装 oxlint 与 oxfmt), 只用 npm 的 lockfile, 不混用 pnpm-lock: CI, 官方测试集与发布一律 `npm ci`, 缺 lockfile 或与 `package.json` 不一致即失败. 增删或升级依赖后重新生成并与 `package.json` 一起提交:

- 先删掉该包的 `node_modules` 再 `npm i --registry=https://registry.npmjs.org/`: 只删 lockfile 时 npm 会沿用 `node_modules/.package-lock.json` 里的旧下载地址, 镜像地址写进 lockfile 后 CI 会从镜像下载.
- `easy-np` 与 `easy-npd` 加 `--lockfile-version=2`: 它们的 CI 在 Node 14(npm 6)上 `npm ci`, npm 6 读不了 v3 lockfile.
- 不要在 `easy-np` / `easy-npd` 目录放 `.npmrc`: 经 `npm` / `npx` 运行测试时其中的配置会传给被测的安装器, 例如 `package-lock=false` 会让 np-lock 相关用例失败.

```bash
npm run install:all          # 在每个包目录下按 lockfile 执行 npm ci
npm test                     # 依次执行每个包的 test
npm test -- easy-np          # 只执行指定的包
npm run lint                 # 在根目录用 oxlint 检查全部包并自动修复; lint:check 只检查
npm run fmt                  # 在根目录用 oxfmt 格式化全部包; fmt:check 只检查
npm run build
```

- 每个包 MUST 提供 `test` 脚本; `typecheck` 与 `build` 有则由 CI 执行. 根目录的 `install:all`, `test`, `build` 由 `scripts/each.mjs` 在各包内依次执行.
- 提交门禁用 lefthook: 配置在根目录 `lefthook.yml`, 提交前对暂存文件先 `oxlint --fix --deny-warnings` 再 `oxfmt --write`, 修复结果自动回填暂存区; CI 的 lint job 仍全仓兜底. lefthook 二进制自装不进 devDependencies, 克隆后执行一次 `lefthook install` 接管钩子; 临时跳过用 `git commit --no-verify` 或 `LEFTHOOK=0`.
- lint 与格式化统一在根目录: oxlint 与 oxfmt 只装在根目录的 devDependencies, 各包不再声明 `lint` / `fmt` 脚本与依赖. oxlint 使用默认规则, 不另配规则: 根目录 `.oxlintrc.json` 只用 `ignorePatterns` 排除入库的测试 fixture, `lint:check` 带 `--deny-warnings`, 出现 warning 即失败, 改代码消除而不是关规则或写豁免注释; 格式化选项在根目录 `.oxfmtrc.json`. 接手新包时删掉上游自带的 lint / 格式化配置与依赖. 根目录执行 `npm ci` 才能运行这两个工具.
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

`.github/workflows/ci.yml` 自动发现 `packages/*`: 除 `easy-np`, `easy-npd` 与 `_` 开头的内部包外, 每个包走通用 job, 在 Node 24 上依次执行 `typecheck`, `test`, `build`(没有的脚本跳过); `lint` job 在根目录 `npm ci` 后对全仓执行 `lint:check` 与 `fmt:check`. `easy-np` 与 `easy-npd` 不走通用 job, 改由专用 job 覆盖 Python, Node 14 至 24 与 Windows; `easy-comb`, `easy-gonz` 与 `easy-mok` 在通用 job 之外另有旧版 Node 冒烟 job, 验证各自 `engines` 下限. 某个包需要更多 Node 版本或平台时, 为它加专用 job; 不再需要通用 job 时把它从 `discover` 的列表中排除. 执行 `npm ci` 的 job 由 setup-node 按该 job 所装目录的 `package-lock.json` 缓存 npm 下载目录, release.yml 发布时不用缓存. 各 workflow 的 token 只有只读权限, PR 上被新推送取代的运行会被取消, main 上的不取消(release.yml 依赖它的结果).

`.github/workflows/official.yml` 用各语法的官方测试集(WPT, css-parsing-tests, sass-spec, less.js test-data)检验 easy-gonz 与 easy-comb: 语料按 `packages/_official_style_suites/suites.json` 钉死的版本下载到 `.cache/official/`, 不入库; 各包的 `test/official-baseline.json` 记录已知失败, 出现新失败即不通过, 修好的用例要在同一改动中执行 `npm run test:official -- --update` 移出基线.

## 发布

GitHub Actions 根据版本 tag 发布 npm 包和 VS Code 插件, 并用该版本的变更日志创建 GitHub Release. 发布流程见 [release.yml](./.github/workflows/release.yml).

1. 同步包的 `package.json`、锁文件和中英文 CHANGELOG, 把发布改动提交到 `main`.
2. 推送 `main`, 再把 `<包目录名>@<版本>` tag 打在同一提交并推送. 工作流会核对版本号及 `RELEASE-BLOCKER` 标记, 等这次提交的 CI 通过再发布.
3. 在 [GitHub Actions](https://github.com/HeavenSky/easy-pkgs/actions/workflows/release.yml) 查看结果. GitHub Release 从英文 CHANGELOG 提取本次版本的条目, 其中的仓库内链接指向发布提交.

以 easy-np 为例, 在仓库根目录运行:

```bash
release_version="$(node -p "require('./packages/easy-np/package.json').version")"
git push origin main
git tag "easy-np@$release_version" main
git push origin "easy-np@$release_version"
```

### npm 包

GitHub Actions 将包发布到 npm 公共注册表. 正式版本更新 `latest`, 版本号带预发布后缀时更新 `next`. 工作流按需构建, 用 `npm pack --ignore-scripts` 打包. easy-np 和 easy-npd 的包内还带由 [锁文件脚本](./scripts/shrinkwrap.mjs) 生成的 `npm-shrinkwrap.json`, 供 npm 按已测试的运行时依赖版本安装.

- 在 npm 包的 Settings → Trusted publishing 中登记 GitHub 仓库 `HeavenSky/easy-pkgs` 和工作流 `release.yml`. 仓库改名后, 更新登记和 `package.json` 的 `repository.url`. 新连接须在 2 天内完成一次成功发布. [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- 新包名可先在本机 `npm login`, 再用 `npm publish --access public` 发布首个版本, 然后登记 Trusted Publishing.

### VS Code 插件

带 `engines.vscode` 的包在 CI 通过后执行 `npm ci`、`npm run check` 和 `npm run package`. 工作流将同一个 VSIX 发布到 VS Code Marketplace, 配置了 `OVSX_PAT` 时也发布到 Open VSX, 并附到 GitHub Release. 已存在的市场版本会跳过.

- 首次发布前, 在 Marketplace 创建与 `package.json` 的 `publisher` 相同的发布者, 将 Azure DevOps 的 Marketplace (Manage) PAT 存为仓库 Secret `VSCE_PAT`. [Marketplace 管理页](https://marketplace.visualstudio.com/manage)
- 发布到 Open VSX 时, 创建访问 token 并存为 `OVSX_PAT`, 再运行 `npx ovsx create-namespace <publisher>` 创建命名空间.

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
- 目录布局: easy-np 把包版本放在 `node_modules/.np/<name>@<version>/node_modules/<name>`, easy-npd 放在 `node_modules/.npd/_<name>@<version>@<name>`; 两者目录名不同, 但同一个 `node_modules` 仍不能混用两个安装器.
- 依赖脚本: 两个包按同一套模型调度生命周期脚本(各自的 `lib/lifecycle_scripts.js`): 整棵依赖树链接完成后运行, 子依赖先行, 互不依赖的包并发 10 个, 根项目脚本最后运行; 改任一个包的调度语义时 MUST 同步修改另一个包.

### 开发约定

- 两个包的脚本名一致: `test`, `test-cov`, `ci`; lint 与格式化在根目录执行, 见「开发」一节.
- 测试按功能放在 `test/<目录>/` 下一层, 支持文件在 `test/support/`; package.json 与 CI 的 mocha spec 写作 `test/*/*.test.js`, 不能写成 `test/**`: fixtures 中依赖包自带的 `*.test.js` 会被当作用例; spec 也不能放进 `.mocharc.js`, 否则命令行指定单个文件时会与它合并成全量.
