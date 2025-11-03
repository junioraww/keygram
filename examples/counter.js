import { TelegramBot, Keyboard } from "keygram";

const bot = new TelegramBot({ 
    token: process.argv[1],
    signLength: 8,
});

// Пример с предварительным описанием функции
const clicked = (ctx, amount = 0) => {
    const keyboard = Keyboard().Callback("✨ Кнопка нажата " + amount + " раз", clicked, amount + 1)
    ctx.reply(`Вы нажали кнопку!`, { keyboard })
}

const mainMenu = Keyboard().Callback("✨ Нажми меня!", clicked)
                           .Text("Кнопка-пустышка") // не нужно указывать callback_data

bot.on('/start', ctx => ctx.reply("Приветствуем!", { keyboard: mainMenu }));

bot.startPolling(console.log); // логируем все запросы от Telegram
