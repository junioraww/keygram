import { TelegramBot, Panel } from "../"

const bot = new TelegramBot({ 
    token: process.argv[2],
    signLength: 8,
});

/* Example: function is pre-defined */
const clicked = (ctx, amount = 0) => {
    const keyboard = Panel().Callback("✨ Button clicked " + amount + " times", clicked, amount + 1)
    ctx.edit(`You clicked the button!`, keyboard)
}

const mainMenu = Panel().Callback("✨ Click me!", clicked)
                        .Text("Dummy button") // No callback_data needed

bot.on('/start', ctx => ctx.reply("Welcome!", mainMenu))

bot.startPolling(console.log) // Log all requests from Telegram
