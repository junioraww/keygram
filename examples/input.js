import { TelegramBot, Callback, Panel } from "../";

const bot = new TelegramBot(process.argv[2]);

/*
 * State saving must always be implemented! Otherwise user may stuck and will have to use /reset
 */
const states = {}
bot.states.save = (ctx, data) => states[ctx.from.id] = data
bot.states.load = ctx => states[ctx.from.id] || {}
bot.alwaysOn('/reset', ctx => ctx.state = {})

const userAges = {}

/*
 * Actual input example
 */
const display = ctx => "📎 Hey, welcome! That's an input example!\nYour age is: " + (userAges[ctx.from.id] || 'not specified')
const startKeyboard = Panel().Display(display).Callback("Fill a form", "openForm").Row()
                                              .Optional(ctx => userAges[ctx.from.id] && Callback("Reset my age", "resetAge"))
const onStart = async ctx => startKeyboard.open(ctx)

const display2 = "<b>Form №1</b>\nAlright. To complete this form, please write your real age"
const formKeyboard = Panel().Display(display2).Callback("Cancel", "cancel")

const openForm = async ctx => {
    ctx.input(handleAge, 'cancel')
    const { result } = await formKeyboard.open(ctx) // or ctx.open(formKeyboard)
    ctx.state.msgId = result.message_id
    return true
}

const handleAge = async ctx => {
    await ctx.call('deleteMessage', { message_id: ctx.state.msgId })
    console.log('Context state', ctx.state)
    const age = parseInt(ctx.text, 10)
    if (!age) return wrongAge(ctx, "Your should write your age!")
    else if (age < 18) return wrongAge(ctx, "You're too young for this!")
    else if (age > 70) return wrongAge(ctx, "You're too old for this!")
    ctx.state = {}
    userAges[ctx.from.id] = age;
    await ctx.reply("<b>Form №1</b>\nSuccessfully set your age!")
    return onStart(ctx)
}

const wrongAge = async (ctx, text) => {
    const { result } = await ctx.reply("<b>Form №1</b>\n" + text, formKeyboard)
    ctx.state.msgId = result.message_id
    return true
}

const cancel = ctx => {
    ctx.state = {}
    return onStart(ctx)
}

const resetAge = ctx => {
    delete userAges[ctx.from.id]
    return ctx.edit("📎 Your age was successfully reset!", startKeyboard)
}


bot.on('/start', onStart)
bot.on('message', ctx => ctx.reply("Unknown action!"))
bot.register(openForm, handleAge, resetAge, cancel)

bot.setParser('HTML')
bot.startPolling()

