# easy-npd

**English** · [简体中文](./zh/README.md)

Install npm dependencies that resume where a failed install stopped, retry across the fastest public registries, and run dependency install scripts only after you approve them.

[![npm version](https://img.shields.io/npm/v/easy-npd.svg)](https://www.npmjs.com/package/easy-npd)
[![npm downloads](https://img.shields.io/npm/dm/easy-npd.svg)](https://www.npmjs.com/package/easy-npd)
[![license](https://img.shields.io/npm/l/easy-npd.svg)](LICENSE.txt)

easy-npd continues [cnpm/npminstall](https://github.com/cnpm/npminstall) 6.8.0 and keeps its flat `node_modules/_<name>@<version>@<name>` layout.
With npminstall, one network hiccup aborts the whole install and a stale mirror means editing the registry by hand; easy-npd keeps installing the other packages and switches registries for you.
With npm, versions are nested wherever the tree puts them; easy-npd keeps every version in one folder named after it and links the highest version to the root.

## See what an install leaves behind

One command installs `debug`, its dependency `ms`, and links both to the root of `node_modules`:

```console
$ npd debug@4.3.4
npd registry: npm > huawei > yarn, binary: official > mirror
✔ Installed 1 packages
✔ Linked 2 latest versions
✔ Run 0 scripts
✔ All packages installed (2 packages installed from npm registry, used 688ms(network 686ms), speed 23.16KB/s, json 2(0B), tarball 15.89KB, manifests cache hit 0, etag hit 0 / miss 0)
$ ls node_modules
_debug@4.3.4@debug
_ms@2.1.2@ms
debug
ms
```

`debug` and `ms` are links to the versioned folders next to them.

## Get started

You need Node.js 14.19.3 or later.

1. Install the commands: `npm i -g easy-npd`
2. Go to your project: `cd <your-project>`
3. Install its dependencies: `npd`

The global `npd` command has the same name as the npm package [`npd`](https://www.npmjs.com/package/npd); if that one is installed globally, add `--force` to step 1.
To get npm / pnpm defaults (a lockfile and approved scripts only), run `npd-x install` instead of `npd`; see [Install npd and pick an entry point](docs/install.md).

## What easy-npd handles for you

- Rerun and continue instead of starting over: one failed package does not stop the install; run `npd` again and it picks up where each package stopped, without downloading again or rerunning scripts that succeeded. [Resume a failed install](docs/resume.md)
- Stop switching registries by hand: npd probes five public registries, retries failed requests across the fastest three, and fetches versions a mirror lacks from npm; a private registry turns switching off. [Choose registries and network settings](docs/registry.md)
- Decide which dependency scripts run: with `npd-x install`, a dependency's install scripts run only after you add it to `allowScripts`, and a tarball that claims to be another package cannot borrow its approval. [Approve dependency install scripts](docs/allow-scripts.md)
- Keep your npm and pnpm configuration: registries and tokens from `.npmrc`, pnpm build settings such as `onlyBuiltDependencies`, and npm `overrides` work as they are. [Configure npd](docs/configuration.md)
- Reproduce installs, even offline: `np-lock.json` locks versions, git commits and tarball integrity, and `--offline` installs from the disk cache without a single request. [Lock versions with np-lock.json](docs/lockfile.md)

## Know when to pick something else

easy-npd does not support npm workspaces: with a `workspaces` field it installs only the root dependencies.
For workspaces or a `node_modules/.store` layout, use [easy-np](../easy-np/README.md); it shares `~/.nprc`, the disk cache and `np-lock.json` with easy-npd, and both can be installed globally side by side.

## Read further

- [Guides](docs/README.md): one page per task, from install options to troubleshooting
- [Migrate from npminstall](docs/migrate-from-npminstall.md): renamed commands, removed flags and behavior differences
- [CHANGELOG](CHANGELOG.md)

## License

MIT, see [LICENSE.txt](LICENSE.txt); the code originates from [cnpm/npminstall](https://github.com/cnpm/npminstall) 6.8.0.
