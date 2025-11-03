# <p align="center">Keygram WIP</p>
<p align="center"><strong>Библиотека для интерактивных панелей</strong></p>
<p align="center">
  <img src="https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram">
  <img src="https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
</p>

## Вступление
В отличие от других библиотек под Telegram Bot API, Keygram предлагает обертки под ```callbacks```
для упрощенного создания интерактивных панелей. Кроме этого, планируется добавить готовые классы
для страничных панелей, кешированных медиа и другое

> Проверено в экосистемах <b>[Bun](https://bun.com/)</b> и <b>[Node](https://nodejs.org/en)</b>, JavaScript и TypeScript

### Особенности

- <b>В коде на Keygram функции "вставляются" в кнопки</b>
</br>При создании клавиатуры с коллбеками, они сохраняются в <b>глобальное хранилище</b> и затем исполняются при каждой обработке callback_data
- <b>Встроенная безопасность</b>
</br>Callback-кнопки по умолчанию имеют <i>сигнатуры</i>, которые усложняют подделку аргументов

### Пример
```js
import { TelegramBot, Keyboard } from "keygram"

const bot = new TelegramBot(process.env.TOKEN)

/* Пример: функция описана предварительньно */
const clicked = (ctx, amount = 0) => {
    const keyboard = Keyboard().Callback("✨ Кнопка нажата " + amount + " раз", clicked, amount + 1)
    ctx.reply(`Вы нажали кнопку!`, { keyboard })
}

const mainMenu = Keyboard().Callback("✨ Нажми меня!", clicked)
                           .Text("Кнопка-пустышка") // Не нужно указывать callback_data

bot.on('/start', ctx => ctx.reply("Приветствуем!", { keyboard: mainMenu }))

bot.startPolling(console.log) // Логируем все запросы от Telegram
```

## В планах

- Класс для пагинации
- Отправка файлов (фото, видео, доки)
- Лучшие практики
