# Schema Enforcer for Obsidian

An Obsidian plugin that enforces frontmatter schemas per folder. Built to solve **schema drift** — where notes gradually accumulate stale, renamed, or non-standard properties, breaking Base views and filters.

## Why?

If you use Obsidian Bases, you know the pain: you set up a Base with filters on `Status` and `Review`, everything works great, then over time notes end up with `status` (lowercase), `Reveiw` (typo), or random properties that don't belong. Your views break, your filters miss things, and cleaning it up manually is tedious.

Schema Enforcer catches this at the source. Define which properties belong in a folder, and the plugin highlights anything that doesn't match — right in the Properties panel where you can see it.

## Features

- **Per-folder schemas** — define allowed properties for any folder in your vault
- **Key violation highlighting** — properties not in the schema are highlighted in red
- **Value validation** — optionally restrict properties to a set of allowed values (highlighted in orange when invalid)
- **Inline error messages** — clear explanations of what's wrong, visible on desktop and mobile
- **Auto-inject on open** — missing properties are automatically added when you open a file
- **Property ordering** — reorder properties in settings, and the plugin enforces that order in your frontmatter
- **Configurable colors** — pick your own violation highlight colors
- **Allow empty toggle** — control whether each property can have an empty value
- **Folder autocomplete** — folder path suggestions when setting up schemas

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/farmerajf/obsidian-schema-enforcer/releases)
2. Create a folder at `<your-vault>/.obsidian/plugins/obsidian-schema-enforcer/`
3. Copy the three files into that folder
4. Enable the plugin in Settings > Community plugins

## Setup

1. Go to Settings > Schema Enforcer
2. Click **Add folder schema**
3. Select a folder path (e.g. `Bases/Tasks`)
4. Add properties that belong in that folder
5. Optionally set allowed values for each property (comma-separated)
6. Use the up/down arrows to set property order

That's it. Open any note in that folder and you'll see violations highlighted immediately.

## Example

For a Movies & TV tracking Base with a `Bases/Movies and TV` folder:

| Property | Allowed Values |
|----------|---------------|
| Title | *(any)* |
| Type | Movie, TV Show |
| Status | Watching, Finished, Dropped, Want to Watch |
| Rating | *(any)* |
| IMDb | *(any)* |

Any note in that folder with a property not in this list (e.g. `genre`, `year`) will be highlighted red. A `Status` value of `Completed` instead of `Finished` will be highlighted orange with a message showing the expected values.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

MIT
