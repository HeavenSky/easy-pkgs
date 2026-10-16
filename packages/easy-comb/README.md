# easy-comb

**English** · [简体中文](./zh/README.md)

Sort properties and unify the code style of CSS, Less, SCSS and Sass files, with the csscomb command and config files you already use.

[![npm version](https://img.shields.io/npm/v/easy-comb.svg)](https://www.npmjs.com/package/easy-comb)
[![npm downloads](https://img.shields.io/npm/dm/easy-comb.svg)](https://www.npmjs.com/package/easy-comb)
[![license](https://img.shields.io/npm/l/easy-comb.svg)](./LICENSE)

easy-comb is a maintained fork of [CSScomb](https://github.com/csscomb/csscomb.js) 4.3.0, which no longer gets fixes.
It keeps the `csscomb` command, `.csscomb.json` and the option names, so switching is one `npm install`.
On top of that it fixes long-standing CSScomb bugs, such as extra semicolons after sorting and broken `rgba()` colors, and parses syntax that CSScomb rejects, such as Less `padding-@{side}`.

## See what it does to a stylesheet

With the built-in config and no config file, `npx csscomb card.css` turns this:

```css
.card{color:#FFFFFF;z-index:2;padding:0 .5em;display:flex;position:relative;
  -webkit-transition:opacity .3s;transition:opacity .3s;background:url('bg.png') #FF0000}
A:hover, LI > SPAN{font-weight:bold;color:#AABBCC;}
```

into this:

```css
.card {
  position: relative;
  z-index: 2;

  display: flex;

  padding: 0 0.5em;

  color: #fff;

  background: url("bg.png") #f00;

  -webkit-transition: opacity 0.3s;
          transition: opacity 0.3s;
}

a:hover, li > span {
  font-weight: bold;
  color: #abc;
}
```

Properties are grouped by role, colors are shortened and lowercased, quotes and leading zeros are unified, and vendor prefixes are aligned.

## Format your first stylesheets

```bash
npm install easy-comb --save-dev
npx csscomb src/styles
npx csscomb --lint src/styles
```

The second command fixes every stylesheet under `src/styles` in place; the third only checks them and exits with `1` if any file would change.
You need Node.js `^16.17.0 || >=18.3.0`; global installs and version details are in [Install easy-comb](docs/install.md).

## What you get

- Your CSScomb setup keeps working: the command is still `csscomb`, `.csscomb.json` and every option name are unchanged, and the few breaking changes are listed in [Switch from CSScomb 4.3.0](docs/migrate-from-csscomb.md).
- **A complete property order you never maintain:** the built-in order follows [stylelint-config-recess-order](https://github.com/stormwarning/stylelint-config-recess-order) and places every other standard property from [mdn-data](https://github.com/mdn/data); unlisted vendor-prefixed properties land right before their standard property, and custom properties (`--color`) can be sorted too. See [Sort properties](docs/sort-order.md).
- Real-world stylesheets format safely: all 18,461 valid cases of WPT, css-parsing-tests, sass-spec and less.js format without a crash or a change in compiled output ([reproduce](docs/contributing.md#run-the-official-test-suites)).
- Your config comes in the format you prefer: JSON, JavaScript or TypeScript with `defineConfig`, or [generated from a stylesheet](docs/detect-config.md) you like ([Configure easy-comb](docs/configuration.md)).
- Style is checked in CI and fixed on commit: `--lint` fails the build on unformatted files, and the same command runs from lint-staged or any editor that can run a command on save ([recipes](docs/integrations.md)); the [Node.js API](docs/node-api.md) ships with TypeScript declarations.

## Know when to use something else

easy-comb changes the order of properties and the details its options control; it does not reprint or wrap whole files.
If you want every line reprinted in one canonical layout, use [Prettier](https://prettier.io); if you already use stylelint and only need property order checked and fixed there, use the [stylelint-order](https://github.com/hudochenkov/stylelint-order) plugin.

## Learn more

- [Guide](docs/README.md): find the page for what you want to do, from the command line to the full option rules
- [Switch from CSScomb 4.3.0](docs/migrate-from-csscomb.md), including a side-by-side comparison
- [CHANGELOG](./CHANGELOG.md)
- [easy-gonz](../easy-gonz/README.md), the parser bundled in `vendor/gonzales-pe`

## License

[MIT](./LICENSE); a fork of CSScomb by [@mishanga](https://github.com/mishanga) and [@tonyganch](https://github.com/tonyganch), see [credits](docs/contributing.md#credits).
