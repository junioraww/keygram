import { TelegramBot, Panel } from "../"

const bot = new TelegramBot({ 
    token: process.argv[2],
    signLength: 8,
});

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
bot.startPolling(console.log) // Log all requests from Telegram
