import { TelegramBot, Panel, Callback, Pagination } from "../";

const bot = new TelegramBot(process.argv[2]);

const exampleText = (ctx, data, page) => `Your personal numbers PikiWedia\nYou're on page ${page+1}/${ctx.maxPage}!`

const data = {}
const exampleData = (ctx, page) => { // each opened panel has it's own data
    if (!data[ctx.msgId]) data[ctx.msgId] = [1, 2, 3, 4, 5, 6, 7].map(x => ({ number: Math.random() }))
    return data[ctx.msgId]
}

const exampleKeys = (_, numbers, page) => 
    Panel().Add(numbers.map(({ number }) => [ Callback("Float " + number.toFixed(4), simpleAnswer, number) ]))

const close = ctx => ctx.delete()
const closeKeys = ctx => Panel().Callback("Close panel", close)

const pages = new Pagination("numbers").Text(exampleText)
                                       .Data(exampleData)
                                       .Keys(exampleKeys)
                                       .AfterKeys(closeKeys)
                                       .PageSize(3)

const simpleAnswer = (ctx, num) => {
    const lucky = /(\d)\1/.test(num.toFixed(4)) // 2+ same numbers next to each other
    ctx.answer(lucky ? "Lucky number!" : "Unlucky number! :(")
}

bot.on('/start', ctx => ctx.open(pages));

bot.register(simpleAnswer)
bot.startPolling()
