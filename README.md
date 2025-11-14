<h1 align="center">Keygram</h1>

<p align="center"><strong>Telegram bot library for interactive panels</strong></p>
<p align="center">
  <img src="https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram">
  <img src="https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
</p>

<b>Language: [[EN]](https://github.com/JuniorAww/keygram/blob/main/README.md) [[RU]](https://github.com/JuniorAww/keygram/blob/main/docs/README.ru.md)</b>

## Introduction

Keygram provides wrappers for Telegram’s callback queries, making it easier to create interactive panels.  
In the near future, I plan to add media caching, a plugin system, and enhanced inline_query support.

> Tested in <b>[Bun](https://bun.com/)</b> and <b>[Node](https://nodejs.org/en)</b> ecosystems, JavaScript and TypeScript

## ✨ Features

* <b>Functions “embedded” into buttons</b>  
When creating a keyboard with callbacks, they are stored in a **global store** and executed whenever the `callback_query` is processed.
* <b>Built-in security</b>  
By default, callback buttons have *signatures* that make it harder to forge arguments.  
This feature can be disabled: `new TelegramBot({ token, signCallbacks: false })`
* <b>Text editing</b>
  - Use a single method `ctx.edit()` to edit both text and file captions. No more separate `bot.editMessageText` or `bot.editMessageCaption` calls!
  - The adaptive method `ctx.respond()` will either send a new message or edit the existing one (if triggered by a callback button)

There are more features and they will be documented soon. For now, you can look at examples!

## 🚀 Installation
Install using your preferred package manager:

```sh
# With Bun
bun add keygram

# With npm
npm install keygram

# With yarn
yarn add keygram
```

## 💡 Keyboard Example

```js
import { TelegramBot, Panel } from "keygram"

const bot = new TelegramBot("YOUR_TOKEN")

/* Example: function is pre-defined */
const clicked = (ctx, amount = 0) => {
    const btnText = "✨ Button clicked " + amount + " times"
    const keyboard = Panel().Callback(btnText, clicked, amount + 1)

    // Use ctx.edit() to edit the message, or ctx.reply() to send a new one
    ctx.edit(`You clicked <b>the button!</b>`, keyboard)
}

const mainMenu = Panel().Callback("✨ Click me!", clicked)
                        .Row()
                        .Text("Dummy button") // No callback_data needed

bot.on('/start', ctx => ctx.reply(`Welcome, <b>${ctx.from.first_name}</b>!`, mainMenu))

bot.setParser('HTML')
bot.startPolling()
```

## 📖 Pagination Example
Pagination functions can be asynchronous, but in this example it's not using that.
```js
import { TelegramBot, Panel, Text, Pagination } from "keygram";

const bot = new TelegramBot("YOUR_TOKEN");

const data = [1, 2, 3, 4, 5, 6, 7].map(x => ({ number: Math.random() }))

const exampleText = (ctx, data, page) =>
`Your personal numbers PikiWedia\nYou're on page ${page+1}/${ctx.maxPage}!`

// If you want to display a slice (for example, 5 elements out of 100) then
// return an array like: [ data_slice_array, total_entries_amount ]
// If you return e.g 7 out of 7 elements, then just return an array of data:
const exampleData = (ctx, page) => data

const exampleKeys = (_, data, page) => 
    Panel().Add(data.map(({ number }) => [ Text("Float " + number.toFixed(4)) ]))

const close = ctx => ctx.delete()
const closeKeys = ctx => Panel().Callback("Close panel", close)

const pages = new Pagination("numbers").Text(exampleText)
                                       .Data(exampleData)
                                       .Keys(exampleKeys)
                                       .AfterKeys(closeKeys)
                                       .PageSize(3)

bot.on('/start', ctx => ctx.open(pages));

bot.startPolling()
```

## 📚 More examples

* [Editable panel with an image](https://github.com/JuniorAww/keygram/blob/main/examples/edit.js)
* [Form input](https://github.com/JuniorAww/keygram/blob/main/examples/input.js)
* [Better pagination](https://github.com/JuniorAww/keygram/blob/main/examples/pagination.js)
* [Showcase of handlers](https://github.com/JuniorAww/keygram/blob/main/examples/handlers.js)
* [Primitive counter (above)](https://github.com/JuniorAww/keygram/blob/main/examples/counter.js)

## 🗺️ Roadmap & Milestones

### Milestones (v0.3.0)
- [x] <strong>Pagination:</strong> Add a ready-to-use class for an interactive panel with pages
- [x] <strong>Scenes:</strong> Add a scene system for multi-step interactions
- [x] <strong>Optimisations:</strong> Refactor the core with best practices in mind! XP


### Future Plans
- [ ] <strong>Persistent Callbacks:</strong> Add PersistentCallback to restore functions on startup
- [ ] <strong>Cached Assets:</strong> Add classes like CachedImage for better media handling
- [ ] <strong>More helpers:</strong> Simplify common Telegram Bot API tasks
