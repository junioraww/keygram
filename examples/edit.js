import { TelegramBot, Panel, ParserError, Image } from "../";

const bot = new TelegramBot(process.argv[2]);

const clicked = async (ctx, initial = true, fox = 1) => {
    const url = `https://randomfox.ca/images/${fox}.jpg`;
    const next = Math.ceil(Math.random() * 124)
    const keyboard = Panel().Callback("🦊 New fox", clicked, false, next)
    const text = "Your foxy, milord! <b>№" + fox + "</b>";
    
    if (initial) ctx.reply({ text, ...Image(url), keyboard })
    else ctx.edit({ text, ...Image(url), keyboard })
}

bot.on('/start', clicked);
bot.register(clicked); // Register callback so after code restarts, buttons can be clicked

bot.setParser('HTML')
bot.dontThrow(ParserError) // Ignore parsing text entities error
bot.startPolling(console.log);
