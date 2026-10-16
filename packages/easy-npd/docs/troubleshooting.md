# Fix common errors

**English** · [简体中文](../zh/docs/troubleshooting.md)

Each entry below starts with the text npd prints, followed by its cause and fix; search this page for the message you see.

## Read an npd error

An npd error prints the message first, then the npd version and the command line; usage and configuration errors print no stack trace.

```text
<message>
npd version: <version>
npd argv: <node> <path to npd> <arguments>
```

Quote all three lines when you report a problem.

## npm stops with EEXIST when installing easy-npd

```text
npm error code EEXIST
```

- Cause: another global package, usually the npm package `npd`, already owns the `npd` command.
- Fix: run `npm i -g easy-npd --force`, see [Install npd and pick an entry point](install.md#install-the-commands).

## npm warns about EBADENGINE when installing easy-npd

```text
npm WARN EBADENGINE Unsupported engine
```

- Cause: on Node.js 14 or 16, tar 7 and its dependencies declare Node 18 or later and `type-fest` 4 declares Node 16 or later; npm 6 prints `npm WARN notsup` instead.
- Fix: nothing to do; the warning is expected and does not affect how npd runs, see [Run on older Node.js and build native modules](node-versions.md#know-what-changes-on-older-nodejs).

## npm stops with EBADENGINE when installing easy-npd

```text
npm ERR! code EBADENGINE
```

- Cause: npm's `engine-strict` is on, so the engine warnings above stop the install; npm 6 prints `npm ERR! code ENOTSUP`.
- Fix: run `npm i -g easy-npd --engine-strict=false`, or use Node.js 18 or later.

## npd rejects an unknown option

```text
unknown option --frozen-lockfle (did you mean --frozen-lockfile?), run npd -h to list the options
unknown option --workspaces, run npd -h to list the options
```

- Cause: the option is misspelled, or it belongs to another package manager and npd does not support it (for example `--workspaces` or `--shamefully-hoist`).
- Fix: use the suggested option, or drop it; see [Pass only options npd knows](install-packages.md#pass-only-options-npd-knows).

## npd finds no package.json

```text
no package.json in <folder>, run npd-x inside a project folder or name the packages to install
no package.json in <folder>, run npd inside a project folder or name the packages to install
```

- Cause: the current folder is not a project and you named no packages.
- Fix: `cd` into the project, or name the packages, such as `npd lodash`.

## Some packages failed

```text
<n> package(s) failed, run npd again to continue from where they stopped:
```

- Cause: a download, sub-dependency or script failed; the other packages are installed.
- Fix: fix the cause listed under each package and run `npd` again, see [Resume a failed install](resume.md).

## A background install script failed

```text
script output: <cache>/np-script-logs/<time>-<name>@<version>-<random>.log
```

- Cause: a dependency's install script failed while running in the background, so its output was not shown.
- Fix: open the log file for the command and full output, or rerun with `--foreground-scripts`.

## Install scripts were skipped

```text
<n> package(s) have install scripts that are not in allowScripts and were skipped:
```

- Cause: with `npd-x install`, dependency install scripts run only when approved.
- Fix: run the `npd-x approve-scripts <names> && npd-x rebuild <names>` command printed below the list, see [Approve dependency install scripts](allow-scripts.md#approve-a-skipped-package).

## The install fails because scripts are not reviewed

```text
install scripts of <n> package(s) are not reviewed in allowScripts
```

- Cause: `--strict-allow-scripts` (or `strictDepBuilds` in pnpm settings) is on and some dependency scripts are neither allowed nor denied; the error code is `EALLOWSCRIPTS`.
- Fix: approve or deny each listed package with `npd-x approve-scripts` or `npd-x deny-scripts`.

## approve-scripts finds nothing to approve

```text
<name> has no installed version with install scripts
```

- Cause: the package is not installed in this project, or none of its installed versions has install scripts.
- Fix: install the project first, and check the name against the skipped list.

## approve-scripts is used with -g

```text
global installs have no project package.json, use npd-x install -g --allow-scripts=<pkg> instead
```

- Cause: global installs have no `package.json` to write `allowScripts` to.
- Fix: reinstall with `--allow-scripts`, see [Approve scripts for global installs](allow-scripts.md#approve-scripts-for-global-installs).

## A tarball claims to be another package

```text
manifest mismatch <name>@<version> tarball contains package.json of <other>@<version>
```

- Cause: the tarball's `package.json` names a different package or version than the registry.
- Fix: none needed; npd uses the registry name and version for links and `allowScripts`. Check that the registry serves the package you expect.

## A package is missing from np-lock.json

```text
<n> package(s) failed, run npd-x install to update np-lock.json:
  - <pkg>: [<pkg>] <pkg> is not in np-lock.json, run npd-x install to update it
```

- Cause: `--frozen-lockfile` is on and `package.json` declares a dependency the lockfile does not have.
- Fix: run `npd-x install` without `--frozen-lockfile` and commit the updated `np-lock.json`, see [Lock versions with np-lock.json](lockfile.md).

## --frozen-lockfile finds no lockfile

```text
--frozen-lockfile requires np-lock.json in <folder>
```

- Cause: the project has no `np-lock.json`.
- Fix: run `npd-x install` once and commit `np-lock.json`.

## --frozen-lockfile is used with package names

```text
--frozen-lockfile can not be used with package arguments, they would change np-lock.json
```

- Cause: adding packages would change the lockfile.
- Fix: add the packages without `--frozen-lockfile`, then commit the lockfile.

## An offline install cannot find a package

```text
Can't find package <name> manifests in offline mode
Can't find tarball <name>@<version> in the disk cache in offline mode
Can't install <spec> in offline mode: remote packages are always fetched from the network
```

- Cause: the package is not in the disk cache, or it is a git or tarball url dependency.
- Fix: install once online, see [Install offline and manage the cache](offline-and-cache.md#install-offline).

## --offline is combined with --no-cache

```text
npd ERROR --offline needs the disk cache, it can not be used with --no-cache
```

- Cause: offline installs read only the disk cache.
- Fix: drop one of the two flags.

## A flag has been removed

```text
--<flag> has been removed, <hint>
```

- Cause: the flag came from npminstall or an older npd and no longer exists.
- Fix: follow the hint; the full list is in [Migrate from npminstall](migrate-from-npminstall.md#replace-removed-commands-flags-and-features).

## node-gyp cannot be installed

```text
npd ERROR install <spec> for node-gyp failed: <reason>
npd ERROR install it manually and point npm_config_node_gyp at it, e.g.:
```

- Cause: npd could not download node-gyp, for example because there is no network.
- Fix: run the printed commands, see [Use your own node-gyp](node-versions.md#use-your-own-node-gyp).

## npd warns about the Node.js version

```text
npd WARN Node vX: <what is degraded>, upgrade to Node >= <version> to restore
```

- Cause: the current Node.js lacks features npd uses, so npd falls back to older implementations.
- Fix: upgrade Node.js to the version shown, or set `np_node_warning=false` to hide the line, see [Run on older Node.js and build native modules](node-versions.md).

## npd warns about workspaces

```text
npd WARN workspaces are not supported, only dependencies of <project>/package.json are installed
```

- Cause: npd does not support npm workspaces.
- Fix: use [easy-np](../../easy-np/README.md) for this project.

## Requests fail behind a proxy or with a custom CA

- Cause: proxy or CA settings are missing for npd or the processes it starts.
- Fix: pass `--proxy` / `--https-proxy` and `--cafile`, or set them in `~/.nprc`; npd passes them to install scripts, node-gyp and git, see [Choose registries and network settings](registry.md#go-through-a-proxy-or-a-custom-ca).
