# easy-np

**English** · [简体中文](./zh/README.md)

An npm installer that resumes after failures, picks the fastest public registry, and runs install scripts only after you approve them.

[![npm version](https://img.shields.io/npm/v/easy-np.svg)](https://www.npmjs.com/package/easy-np)
[![npm downloads](https://img.shields.io/npm/dm/easy-np.svg)](https://www.npmjs.com/package/easy-np)
[![license](https://img.shields.io/npm/l/easy-np.svg)](LICENSE.txt)

Use easy-np in place of `npm install` or cnpm's npminstall in an existing project: it reads your `.npmrc`, `pnpm-workspace.yaml` and npm workspaces as they are. Compared with npminstall 8.0.1, one failed package no longer stops the whole install, and no dependency script runs before you review it.

## See an install script held for review

`np-x install` installs the package, skips its `postinstall` and tells you how to approve it:

```console
$ np-x install esbuild
np registry: npm > huawei > yarn, binary: official > mirror (cached)
✔ Linked 2 latest versions as fallback to ~/demo/node_modules/.store/node_modules
1 package(s) have install scripts that are not in allowScripts and were skipped:
  - esbuild@* (postinstall)
review them, then run: np-x approve-scripts esbuild && np-x rebuild esbuild
✔ Installed 1 packages on ~/demo
✔ All packages installed (2 packages installed from npm registry, used 3s(network 3s), speed 1.54MB/s, json 27(0B), tarball 4.26MB, manifests cache hit 0, etag hit 0 / miss 0)

dependencies:
+ esbuild ^0.28.2

np np-lock.json updated
$ np-x approve-scripts esbuild && np-x rebuild esbuild
approved esbuild@0.28.2
run np-x rebuild esbuild to run their install scripts now
np registry: npm > yarn > alibaba, binary: official > mirror
> esbuild@0.28.2 postinstall ~/demo/node_modules/.store/esbuild@0.28.2/node_modules/esbuild
> node install.js
> esbuild@0.28.2 postinstall, finished in 563ms
$ npx esbuild --version
0.28.2
```

After these commands `package.json` contains `"allowScripts": { "esbuild@0.28.2": true }`, `np-lock.json` records the resolved versions, and `npx esbuild --version` runs the native binary that the postinstall fetched. The registry order differs because the install reused an earlier speed probe (`(cached)`) and the rebuild probed again.

## Get started

Three commands take you from nothing to an approved install script; you need Node.js >= 14.18.0.

1. Install the two commands `np` and `np-x`: `npm i -g easy-np`
2. Install your project's dependencies: `np-x install`
3. Approve a skipped dependency and run its scripts: `np-x approve-scripts esbuild && np-x rebuild esbuild`

The global `np` command has the same name as sindresorhus's release tool [`np`](https://www.npmjs.com/package/np), so installing one while the other is installed globally fails with `EEXIST`; see [Avoid the np name clash](docs/install.md#avoid-the-np-name-clash).

Prefer npminstall's defaults? `np` is `np-x install --no-lockfile --dangerously-allow-all-scripts`; see [Choose np or np-x install](docs/install.md#choose-np-or-np-x-install).

## What you get

- A failed package does not waste the whole install: the other packages finish, the failures are listed at the end, and running `np` again resumes without downloading again or deleting `node_modules` ([details](docs/resume.md)).
- **Dependency install scripts run only after you approve them**: `np-x install` runs `preinstall`, `install` and `postinstall` only for entries in `allowScripts`, and each entry can be pinned to a version, a git commit, or a tarball URL; a tarball that claims another package name gets a `manifest mismatch` warning and cannot reuse that package's approval ([details](docs/allow-scripts.md)).
- A fast public registry without configuration: easy-np probes npm, yarn, alibaba (npmmirror), tencent and huawei, uses the fastest three, retries a failed download on the next one, and fetches from npm when a mirror lacks a new version; with a private registry configured it uses only that registry ([details](docs/registry.md)).
- Your npm and pnpm setup keeps working: npm workspaces with the `workspace:` protocol, `.npmrc`, `pnpm-workspace.yaml` and `onlyBuiltDependencies` apply without changes, and the `.store` layout limits the root `node_modules` to your direct dependencies and the packages you hoist ([details](docs/workspaces.md)).
- Reproducible installs, even on old Node.js: `np-lock.json` locks git commits and tarball sha512 integrity, `--frozen-lockfile` fails CI on a missing entry, and CI runs the full test suite on Node.js 14.18.0, 16, 18 and 22 ([ci.yml](../../.github/workflows/ci.yml)).

## When to use something else

If you want npminstall's early flat `_<name>@<version>@<name>` layout and do not need workspaces, use [easy-npd](../easy-npd/README.md); it shares `~/.nprc`, the disk cache and `np-lock.json` with easy-np and installs side by side. If your team needs `package-lock.json` or `pnpm-lock.yaml` kept up to date, stay with npm or pnpm: easy-np can install from a `package-lock.json` but writes only `np-lock.json`.

## Read more

- [Guide](docs/README.md): every command, option and configuration file, organized by task.
- [Migrate from npminstall](docs/migrate-from-npminstall.md): renamed commands, removed options and behavior differences.
- [Troubleshooting](docs/troubleshooting.md): error messages and how to fix them.
- [CHANGELOG](CHANGELOG.md): what changed in each version.

## License

[MIT](LICENSE.txt); the code is derived from [cnpm/npminstall](https://github.com/cnpm/npminstall) 8.0.1, thanks to the cnpm team.
