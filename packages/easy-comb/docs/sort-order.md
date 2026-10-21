# Sort properties

**English** · [简体中文](../zh/docs/sort-order.md)

This page shows how to put properties, preprocessor variables and mixins in the order you want with `sort-order`; it assumes you have a [config file](configuration.md), or are happy with the [built-in order](#use-the-built-in-order).

## Define the order

`sort-order` is a list of property names, or a list of groups; easy-comb separates groups with an empty line.

```json
{
	"sort-order": [
		["position", "top"],
		["margin", "padding"]
	]
}
```

```css
/* before */
p {
	padding: 0;
	top: 0;
	margin: 0;
	position: absolute;
}

/* after */
p {
	position: absolute;
	top: 0;

	margin: 0;
	padding: 0;
}
```

Property names match case-insensitively (`Z-INDEX` sorts like `z-index`), and the output keeps the original case.

## Place vendor-prefixed properties

Prefixed properties don't need to be listed: `-webkit-transition` is placed right before `transition`.
Several prefixes of the same property follow the order `-webkit-`, `-khtml-`, `-moz-`, `-ms-`, `-o-`.
A prefixed property that you list explicitly uses its own position instead.

## Place custom properties

Custom properties match by their full name: list `--color` to place it. `--color` never matches `color`.
The keyword `$custom-property` places every custom property that isn't listed by name.

## Place properties you didn't list

Properties that are not in the list go into a new group at the end, in source order, or alphabetically with `"sort-order-fallback": "abc"`.
To put them somewhere else, add `"..."` to the list where they belong:

```json
{ "sort-order": [["$variable"], ["position"], ["...", "border"], ["font"]] }
```

## Order preprocessor declarations

In Less, Sass and SCSS, these keywords can be used in the list like property names:

| Keyword               | Places                                        |
| --------------------- | --------------------------------------------- |
| `$variable`           | Variable declarations                         |
| `$include`            | Every mixin include that isn't listed by name |
| `$include mixin-name` | Includes of that mixin                        |
| `$extend`             | Extends                                       |
| `$import`             | `@import`                                     |

```json
{ "sort-order": [["$variable"], ["$include"], ["top", "padding"], ["$include media"]] }
```

```scss
/* before */
p {
	padding: 0;
	@include media("desktop") {
		color: black;
	}
	$color: tomato;
	top: 0;
	@include mixin($color);
}

/* after */
p {
	$color: tomato;

	@include mixin($color);

	top: 0;
	padding: 0;

	@include media("desktop") {
		color: black;
	}
}
```

The bodies of `@function` are never sorted.

## Use the built-in order

The built-in order follows [stylelint-config-recess-order](https://github.com/stormwarning/stylelint-config-recess-order), in groups for positioning, layout, box model, typography, interaction, visual, motion and fragmentation.
easy-comb fills in the properties that recess-order lacks from [mdn-data](https://github.com/mdn/data) and places them next to their closest relatives; it lists prefix-only properties such as `-webkit-font-smoothing` explicitly.
A script generates the list into [src/config/sort-order.ts](../src/config/sort-order.ts); don't edit it by hand; to change it, see [Regenerate the built-in property order](contributing.md#regenerate-the-built-in-property-order).
To use it as the base of your own order, copy it from that file into your config.
