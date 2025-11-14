
<h1 align="center">Keygram</h1>

<p align="center"><strong>Библиотека для Telegram-ботов с интерактивными панелями</strong></p>
<p align="center">
  <img src="https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram">
  <img src="https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
</p>

<b>Язык: [[EN]](https://github.com/JuniorAww/keygram/blob/main/README.md) [[RU]](https://github.com/JuniorAww/keygram/blob/main/docs/README.ru.md)</b>

## Введение

Keygram предоставляет обёртки для callback-запросов Telegram, упрощая создание интерактивных панелей.  
В ближайшем будущем планируется добавить кэширование медиа, систему плагинов и расширенную поддержку inline_query.

> Проверено в <b>[Bun](https://bun.com/)</b> и <b>[Node](https://nodejs.org/en)</b>, на JavaScript и TypeScript

## ✨ Возможности

* <b>Функции “встроенные” в кнопки</b>  
При создании клавиатуры с callback они сохраняются в **глобальном хранилище** и выполняются при обработке `callback_query`.
* <b>Встроенная безопасность</b>  
По умолчанию кнопки callback имеют *подписи*, которые затрудняют подделку аргументов.  
Эта функция может быть отключена: `new TelegramBot({ token, signCallbacks: false })`
* <b>Редактирование текста</b>
  - Используйте один метод `ctx.edit()` для редактирования текста и подписей файлов. Больше не нужно вызывать `bot.editMessageText` или `bot.editMessageCaption` отдельно!
  - Адаптивный метод `ctx.respond()` либо отправит новое сообщение, либо отредактирует существующее (если вызвано кнопкой callback)

Скоро будут задокументированы и другие функции, а пока можно ориентироваться на примеры!

## 🚀 Установка
Установите с помощью предпочитаемого менеджера пакетов:

```sh
# С Bun
bun add keygram

# С npm
npm install keygram

# С yarn
yarn add keygram
```

## 💡 Пример клавиатуры

```js
import { TelegramBot, Panel } from "keygram"

const bot = new TelegramBot("YOUR_TOKEN")

/* Пример: функция заранее определена */
const clicked = (ctx, amount = 0) => {
    const btnText = "✨ Кнопка нажата " + amount + " раз"
    const keyboard = Panel().Callback(btnText, clicked, amount + 1)

    // Используйте ctx.edit() для редактирования сообщения или ctx.reply() для отправки нового
    ctx.edit(`Вы нажали <b>кнопку!</b>`, keyboard)
}

const mainMenu = Panel().Callback("✨ Нажми меня!", clicked)
                        .Row()
                        .Text("Простая кнопка") // callback_data не требуется

bot.on('/start', ctx => ctx.reply(`Добро пожаловать, <b>${ctx.from.first_name}</b>!`, mainMenu))

bot.setParser('HTML')
bot.startPolling()
```

## 📖 Пример пагинации
Функции пагинации могут быть асинхронными, но в этом примере используется синхронный подход.
```js
import { TelegramBot, Panel, Text, Pagination } from "keygram";

const bot = new TelegramBot("YOUR_TOKEN");

const data = [1, 2, 3, 4, 5, 6, 7].map(x => ({ number: Math.random() }))

const exampleText = (ctx, data, page) =>
`Ваши личные числа PikiWedia
Вы на странице ${page+1}/${ctx.maxPage}!`

const exampleData = (ctx, page) => data // Можно запросить из базы данных и т.д.
// Если возвращаете срез (например, 5 элементов из 100), формат возврата [срез_данных, общий_размер_данных]

const exampleKeys = (_, numbers, page) => 
    Panel().Add(numbers.map(({ number }) => [ Text("Число " + number.toFixed(4)) ]))

const close = ctx => ctx.delete()
const closeKeys = ctx => Panel().Callback("Закрыть панель", close)

const pages = new Pagination("numbers").Text(exampleText)
                                       .Data(exampleData)
                                       .Keys(exampleKeys)
                                       .AfterKeys(closeKeys)
                                       .PageSize(3)

bot.on('/start', ctx => ctx.open(pages));

bot.startPolling()
```

## 📚 Дополнительные примеры

* [Редактируемая панель с изображением](https://github.com/JuniorAww/keygram/blob/main/examples/edit.js)
* [Форма ввода](https://github.com/JuniorAww/keygram/blob/main/examples/input.js)
* [Улучшенная пагинация](https://github.com/JuniorAww/keygram/blob/main/examples/pagination.js)
* [Обзор обработчиков](https://github.com/JuniorAww/keygram/blob/main/examples/handlers.js)
* [Простейший счетчик (выше)](https://github.com/JuniorAww/keygram/blob/main/examples/counter.js)

## 🗺️ Дорожная карта и этапы

### Этапы (v0.3.0)
- [x] <strong>Пагинация:</strong> Добавлен готовый класс для интерактивной панели с страницами
- [x] <strong>Сцены:</strong> Добавлена система сцен для многошагового взаимодействия
- [x] <strong>Оптимизации:</strong> Рефакторинг ядра с учетом лучших практик! XP


### Будущие планы
- [ ] <strong>Постоянные callback:</strong> Добавить PersistentCallback для восстановления функций при старте
- [ ] <strong>Кэшированные ресурсы:</strong> Добавить классы вроде CachedImage для удобной работы с медиа
- [ ] <strong>Дополнительные помощники:</strong> Упростить общие задачи Telegram Bot API
