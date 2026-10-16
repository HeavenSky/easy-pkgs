# Format and check files from the command line

**English** · [简体中文](../zh/docs/command-line.md)

This page shows how to use `csscomb` to fix stylesheets in place, format standard input, and check files without changing them; it assumes easy-comb is [installed](install.md).
Inside a project, prefix the commands with `npx`.

## Fix files in place

```bash
csscomb src/styles/main.scss src/styles/components
```

Pass any number of files and directories; directories are processed recursively.
easy-comb formats files ending in `.css`, `.less`, `.sass` and `.scss`; other extensions can be added with `syntax`, see [Configure easy-comb](configuration.md#settings-besides-options).
Without `--config`, the options come from the [nearest config file](configuration.md#where-easy-comb-looks-for-a-config), or the built-in config if there is none.

## Format standard input

```bash
cat main.css | csscomb -
```

The formatted result goes to standard output.
Standard input is always parsed as CSS, and there is no option to choose another syntax; to format Less, SCSS or Sass, pass the file path instead.
easy-comb reads standard input when the only argument is `-`, or when there are no path arguments and standard input is not a terminal.
With `-t` (`--tty-mode`) it never reads standard input. Editors usually spawn `csscomb` with a pipe attached, so they should pass `-t`.

## Check files without changing them

```bash
$ csscomb -lv assets/css
! assets/css/forms.scss
! assets/css/buttons.scss
  assets/css/main.scss
3 files processed
0 files fixed
```

`--lint` (`-l`) leaves every file untouched and exits with `1` if any file would change, `0` otherwise.
With `--verbose` (`-v`), each processed file is printed: `!` marks a file that needs changes, `✓` a file that was fixed, and no mark means the file was already formatted.

## Look up command-line options

| Option | Effect |
| --- | --- |
| `-c, --config <path>` | Use this config file instead of searching for one. It may be any [config file format](configuration.md#where-easy-comb-looks-for-a-config), or a `.css` file whose style is [detected and used as the config](detect-config.md#use-a-stylesheet-as-the-config). |
| `-d, --detect <file>` | Print the options detected in a stylesheet as JSON and exit, see [Generate a config from a stylesheet](detect-config.md). |
| `-l, --lint` | Report files that need changes without modifying them; exit with `1` if there are any. |
| `-v, --verbose` | Print every processed file and a summary. |
| `-t, --tty-mode` | Never read standard input. |
| `-h, --help` | Show the help and exit. |
| `-V, --version` | Print the version of easy-comb and exit. |

A `--config` file that doesn't exist stops the run with `Configuration file <path> was not found.`; a file that fails to load stops it with `Error parsing configuration file <path>.` followed by the cause. Both exit with `1`.
`--config` or `--detect` without a value prints `Option --config requires a <path> argument.` (or `<file>` for `--detect`) and exits with `1`.

## Read the exit code

- `0`: the run succeeded; with `--lint`, no file needs changes.
- `1`: with `--lint`, at least one file needs changes; or the run stopped on an error, such as a missing path, a missing or broken config file, or an option without its value.
- `1` is also returned when you run `csscomb` without paths while standard input is a terminal; it then prints the help instead of waiting for input.
- `2`: an unknown option; nothing is processed.

Before processing anything, easy-comb checks that every path exists, so a missing path never leaves the other files half done.

## Fix common errors

**`Unknown option '--lnt'.` followed by the help text**

- Cause: the option is misspelled or doesn't exist; easy-comb exits with `2` without processing any file.
- Fix: correct the option; `csscomb --help` lists every option.

**`File or directory nope.css was not found.`** (or `File nope.css was not found.` with `--detect`)

- Cause: a path passed on the command line doesn't exist relative to the current directory.
- Fix: correct the path, or run the command from the directory the paths are relative to.

**`Cannot load TypeScript config <path>: …`**

- Cause: the TypeScript config can't be loaded by Node's type stripping.
- Fix: see [Fix a TypeScript config that fails to load](configuration.md#fix-a-typescript-config-that-fails-to-load).
