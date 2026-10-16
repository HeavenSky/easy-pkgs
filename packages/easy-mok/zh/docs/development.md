# 从源码构建与测试

[English](../../docs/development.md) · **简体中文**

读完本页，你能构建 easy-mok、运行测试，并在热更新下开发管理页。以下命令在仓库的 `packages/easy-mok` 目录下执行。

```bash
npm i
npm run build        # 编译服务端到 dist/server，构建管理页与悬浮条到 dist/ui；测试与演示服务经 jiti 直接运行 TS 源码，无需先构建
npm test             # 服务端（express 4 / 5 两套宿主）与管理页测试
npm run typecheck
npm run lint:check
npm run dev:server   # 演示服务 http://127.0.0.1:4100/，管理页 /__mock/
npm run dev:ui       # 管理页热更新开发，接口代理到演示服务
npm run test:e2e     # 需先 build，并启动开启远程调试、监听 127.0.0.1:9222 的 Chrome
```
