---
title: Getting Started
description: How to install and configure the content layer — tests TOC depth and heading ids.
---

# Getting Started

This guide walks you through installation and basic usage.

## Installation

Run the following command:

```sh
npm install @jasonshimmy/vite-plugin-cer-app
```

## Configuration

Add the `content` option to `cer.config.ts`:

```ts
export default defineConfig({
  content: {},
})
```

### Options

| Option | Default | Description |
|---|---|---|
| `dir` | `'content'` | Content directory relative to `app/`. |
| `drafts` | `false` | Include draft items in production builds. |

## Usage

Use `queryContent()` in any page or loader:

```ts
const posts = await queryContent('/blog').find()
```

## Next Steps

- Read the [full docs](https://example.com)
- Join the community
