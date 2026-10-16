# Generate a config from a stylesheet

**English** · [简体中文](../zh/docs/detect-config.md)

This page shows how to turn the style of a stylesheet you like into a config, instead of writing one by hand; it assumes easy-comb is [installed](install.md).
Every option except `sort-order` can be detected.

## Generate a config file

```bash
csscomb -d example.css > .csscomb.json
```

The file contains every option that easy-comb could detect in `example.css`; edit it like any other [config file](configuration.md).

## Use a stylesheet as the config

```bash
csscomb -c example.css assets/css
```

When the `--config` path ends in `.css`, easy-comb detects its style on every run instead of loading it as a config file.

## Fill unset options from a template stylesheet

```json
{
    "template": "example.css",
    "leading-zero": false,
    "vendor-prefix-align": true
}
```

With `template`, the options detected in that stylesheet fill in every option that the config doesn't set itself, so your config only lists the options you want to change.
The `template` path is relative to the config file's directory, so it resolves the same wherever you run `csscomb`.
A `template` file that doesn't exist stops the run with `Template configuration file <path> was not found.`
Only the `csscomb` command reads `template`; the [Node.js API](node-api.md#static-methods) ignores it.
