# Lock versions with np-lock.json

**English** · [简体中文](../zh/docs/lockfile.md)

`np-lock.json` makes installs reproducible, including CI runs that must not drift; use `np-x install`, because `np` turns the lockfile off ([Choose np or np-x install](install.md#choose-np-or-np-x-install)).

## Lock a project in CI

1. Install once with `np-x install`, which has the lockfile on by default. You should see: the output ending with `np np-lock.json updated`, and `np-lock.json` in the project root.
2. Commit `np-lock.json` together with `package.json`.
3. In CI install only from the lockfile: `np-x install --frozen-lockfile`. You should see: any dependency without an entry fails with `<pkg> is not in np-lock.json, run np-x install to update it`.

## Use the lockfile options

| Option                        | Meaning                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--lockfile`, `--no-lockfile` | Read and write `np-lock.json` or not; on by default, `np` always adds `--no-lockfile`                              |
| `--frozen-lockfile`           | Install only from `np-lock.json`, fail on a missing entry, never write back; cannot be combined with package names |
| `--from-package-lock=<file>`  | Install the versions locked in a `package-lock.json` (lockfileVersion >= 2), ignoring its optional dependencies    |

## What np-lock.json records

- After a successful install, `np-lock.json` is written to the project root (the workspace root in a workspace project) and records the version each dependency declaration (`name@spec`) resolved to; the next install reuses it.
- easy-npd reads and writes the same file.
- Whether the lockfile is on is decided by the first of these that is set: `--lockfile` / `--no-lockfile` > `--frozen-lockfile` (counts as on) > `np_lockfile` > `config.np.lockfile` > `lockfile` and `package-lock` from pnpm and `.npmrc` > on. The `--no-lockfile` that `np` adds counts as a command-line option.
- A full install keeps only the entries it used.
- Partial installs only add entries: installs with `<pkg>`, run inside a workspace directory, run with `--workspaces`/`--only`/`--omit`, or that skip non-standard fields.
- When an installed version differs from the locked one, easy-np replaces it with the locked version; `np-x update` ignores the locked versions, resolves the ranges again and writes the result back.
- `np <pkg>` records the declaration it saves into `package.json`; a tag, `*`, or no version on the command line is resolved again on every install.
- When the project already has another package manager's lockfile and no `np-lock.json`, no `np-lock.json` is created.
- With `--from-package-lock` or `-g`, `np-lock.json` is neither read nor written.
- Git dependencies are locked to a commit, tarball URL dependencies to a sha512 integrity; local folder dependencies are not locked.
- Credentials in URLs are never written into the lockfile.

## Install from an npm package-lock.json

`--from-package-lock=<file>` installs the versions an npm `package-lock.json` locked, which helps when you move a project from npm.

- The file must have lockfileVersion 2 or later; easy-np ignores the optional dependencies it lists.
- In a workspace project it reads npm's workspace lockfile, and each workspace gets the versions locked there.
- If the file cannot be loaded, the install exits with an error instead of resolving from the network.
