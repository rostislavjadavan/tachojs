
![logo](logo/tacho_logotype.png)

Tacho is simple NodeJS script to glue pages with layout using HandlbarsJS as templates and yaml files for data.

# CLI

## Create new site
```
node tachojs create [site]
```

## Build site
```
node tachojs build [site]
```

## Extra config

```
node tachojs build [site] -e config-file.yaml
```

## Enable debug

```
node tachojs build [site] -d
```

# Example

To build:
```
node tachojs build example
```

Site is built to ```dist-example``` directory. To view:
```
serve dist-example
```

Then visit http://localhost:5000 and you should see result.

# Site structure

Use ```node tachojs build [site]``` to build new site. Structure of newly created site is following:
- /assets
- /pages
- /templates
- /partials
- config.yaml

Values from ```config.yaml``` will be passed to every page (and template) during the build.

## Anatomy of page

Following page will be rendered using ```default.html``` template. ```title``` (and all other params) will be propagated to template.

```
---
title: Page title
template: default.html
---

<div>html content</div>
```

### Insert partial

```
 {{{partial "menu.html"}}}
```

## Anatomy of template

Example:
```
<head>
...
    <title>{{title}}</title>
...
</head>
...
<body>
    {{{content}}}
</body>
...
```
Page content will be inserted at ```{{{content}}}``` placeholder.

## Site config

Example:
```
siteTitle: site name
domain: https://exmaple.com
minify: true
copyAssets:
     - assets
     - [ ../static, static]
```

```siteTitle``` and ```domain``` can be used during page and template rendering (as any other params that you define here).

Directories in ```copyAssets``` list will be copied to output directory.

```minify``` will remove whitespaces and newlines to make file as small as possible