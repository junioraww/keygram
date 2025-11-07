import { TelegramBot, Keyboard } from "../";

const bot = new TelegramBot(process.argv[2]);

/* In-memory user database simulation */
const users = {} // JSON.parse(fs.readFileSync('./users.json', 'utf-8'))

/* Async function to simulate DB access in real environment */
const getUser = async ctx => {
    const { id, first_name } = ctx.from
    if (!users[id]) users[id] = { name: first_name, exp: 0 }
    return users[id]
}

const onStart = async ctx => {
    const user = await ctx.getUser()
    const text = "Your name is " + user.name 
               + "\nLevel: " + Math.ceil(user.exp / 5 + 0.01)
               + "\n-> Exp left: " + (5 - user.exp % 5).toFixed(1)
    return await ctx.reply(text)
}

bot.use(ctx => {
    ctx.getUser = () => getUser(ctx)
})

/* Grant a random amount of EXP for each message (simulating user progression) */
bot.use(async ctx => {
    const user = await ctx.getUser()
    user.exp += Date.now() % 10 / 5
})

/* React to specific content types using an arrow function. 
   Since ctx.react(...) returns a value, further middleware execution is stopped automatically.
   This is how the library works: returning anything from a handler halts the middleware chain (like ctx.stop). */
bot.on('photo', ctx => ctx.react("❤"))
bot.on('voice', ctx => ctx.react("👍"))
bot.on('poll', ctx => ctx.react("👾"))

bot.on('/start', onStart);

bot.use(ctx => ctx.reply("Unknown message!", Keyboard().Text("/start")))

bot.startPolling()
