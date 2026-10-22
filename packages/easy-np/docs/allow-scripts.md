# Approve dependency install scripts

**English** · [简体中文](../zh/docs/allow-scripts.md)

A dependency's install scripts run on your machine only after you approve the dependency in `allowScripts`; this applies to `np-x install`, and to `np` when you pass `--no-dangerously-allow-all-scripts` ([Choose np or np-x install](install.md#choose-np-or-np-x-install)).

## Review a skipped package

1. Install as usual: `np-x install`. You should see: packages whose scripts were skipped listed after `package(s) have install scripts that are not in allowScripts and were skipped:`.
2. List the packages still waiting for review at any time: `np-x approve-scripts --pending`.
3. Approve one after you have checked it: `np-x approve-scripts esbuild`. You should see: `approved esbuild@<version>`, and an `allowScripts` entry for that version in `package.json`.
4. Run its scripts now: `np-x rebuild esbuild`.
5. To refuse a package for good: `np-x deny-scripts core-js`. You should see: a `"core-js": false` entry; its scripts never run and it is no longer listed as unreviewed.

## Which scripts need approval

Only scripts of dependencies need approval, as in npm 12; the scripts of the root project, of workspaces and of local folder dependencies they declare always run.

- Scripts that need approval: `preinstall`, `install` and `postinstall` of dependencies, the implicit `node-gyp rebuild` when a dependency has `binding.gyp`, and building git dependencies.
- Packages that are not approved are skipped; the end of the install lists them with the commands to approve and rerun them.
- Approved dependency scripts run after the whole dependency tree is linked, as in npm, so a script can load its siblings and peer dependencies; a package's scripts run after those of its own dependencies, and packages that do not depend on each other run in parallel.

## Write allowScripts

`allowScripts` lives in the root `package.json`:

```json
{ "allowScripts": { "esbuild": true, "sharp@0.33.5": true, "core-js": false } }
```

- A key is a package name (all versions), `<name>@<exact version>` or several exact versions joined with `||`, a git address, or a tarball URL; ranges and dist-tags produce a warning and are ignored.
- `false` denies; when an allow and a deny entry both match, deny wins.
- Only the first source that has any setting is used: `--allow-scripts` > `allowScripts` in the root `package.json` > pnpm build settings > `allow-scripts` in `~/.nprc`.
- pnpm's `onlyBuiltDependencies` counts as allow, `ignoredBuiltDependencies` and `neverBuiltDependencies` count as deny, `allowBuilds` allows or denies by each entry's boolean value; with only `neverBuiltDependencies` set, every other dependency is allowed.
- The first time it writes `allowScripts`, easy-np merges your pnpm build settings into it.

## Use the script options

| Option                            | Meaning                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ignore-scripts`                | Run no install scripts at all, and do not build git dependencies or the root project's `binding.gyp`                                                              |
| `--allow-scripts=<pkg>[,<pkg>]`   | Approve these dependencies, overriding `allowScripts`; mainly for `-g`                                                                                            |
| `--strict-allow-scripts`          | Exit with a non-zero code when any dependency script is unreviewed                                                                                                |
| `--dangerously-allow-all-scripts` | Ignore `allowScripts` and run every dependency script; off by default, always added by `np`, turned off with the `--no-` prefix                                   |
| `--foreground-scripts`            | Show the output of dependency install scripts, which run in the background by default; scripts of the root project and local folder dependencies are always shown |

- `--strict-allow-scripts` and `--dangerously-allow-all-scripts` take the first value that is set: command line > `npm_config_*` > `~/.nprc` > `.npmrc` > pnpm's `strictDepBuilds` / `dangerouslyAllowAllBuilds` > off. The `--dangerously-allow-all-scripts` that `np` adds counts as command line.
- `--ignore-scripts` wins over all of the above.

## Approve git, tarball and local dependencies

- A registry package is reviewed by its `name@version` on the registry. When the `package.json` inside its tarball claims to be another package, you get a `manifest mismatch` warning and the package cannot reuse the other package's approval.
- `file:` local dependencies declared by registry, git and tarball URL packages follow the approval of the package that declares them and run only `preinstall`, `install` and `postinstall`; in the skipped list they appear as `<name>@<spec> (declared by <declarer>)`.
- When a git dependency declares `prepare`, `build`, `install` or similar scripts, or workspaces, easy-np must build it, so it reviews the repository address first.
- The sub-install of that build runs no dependency scripts, does not build nested git dependencies, does not read the cloned repository's own `allowScripts` and `~/.nprc`, and does not read or write `np-lock.json`.
- `np-x approve-scripts <pkg>` writes `<pkg>@<installed version>`; for a git dependency it writes the address and commit, for a tarball URL dependency the URL, both without credentials.
- A git dependency is built when it is fetched: after approving it, delete its `.np` directory as the message tells you and run `np` again.
- `np-x deny-scripts` writes a `false` entry without a version, as npm does.

## Approve scripts for a global install

When you install globally, the scripts of the package you install always run. The scripts of local dependencies it declares run only after you approve that package with `--allow-scripts=<pkg>` or in `~/.nprc`; the skipped list ends with an `np-x install -g --allow-scripts=...` command to reinstall with.
