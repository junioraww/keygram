import { TelegramBot, Context } from '$'
import { INSTANCES, BOT_IDS } from '$/store'
import { NoBotSelected } from '$/errors'

/**
 * Serialized button
 */
export interface Button {
    text: string;
    callback_data?: string;
    url?: string;
}

function randomCbName(): string {
    return btoa(Math.random().toString()).slice(2, 8)
}

/*
 * Creates keyboard with callback
 */
export function Callback(text: string, action: Function | string, ...args: any[] | undefined[]) {
    const bot = INSTANCES[BOT_IDS[0]];
    if (!bot) throw new NoBotSelected("No bot initialized");

    let unsigned;
    const strArgs = (args?.length ? (' ' + args?.join(' ')) : ''); // stringified args

    if (typeof action !== 'string') {
        // todo warning with anon functions
        if (action.name === 'anon') {
            const id: string = randomCbName();
            (bot as any).registerAnon(id, action);
            unsigned = id + strArgs;
        }
        else {
            if (!bot.hasCallback(action)) bot.register(action);
            unsigned = action.name + strArgs;
        }
    }
    else {
        unsigned = action + strArgs;
    }

    const callback_data = bot.requireSig() ? (bot.sig(unsigned) + ' ' + unsigned) : unsigned;

    return {
        text, callback_data
    }

    /*const obj = new KeyboardClass(bot, true);
    return obj.Callback(text, action, ...args);*/
}

export function Text(text: string) {
    return {
        text, callback_data: ' '
    }
}

/*
 * Creates reply keyboard
 * @param {number} [botId] Bot ID (optional)
 */
export function Keyboard(botId: number | undefined) {
    return createKeyboard(botId, false)
}

/*
 * Creates inline keyboard
 * @param {number} [botId] Bot ID (optional)
 */
export function Panel(botId: number | undefined) {
    return createKeyboard(botId, true)
}

function createKeyboard(botId: number | undefined, isInline: boolean): KeyboardClass {
    const bot = INSTANCES[botId || BOT_IDS[0]];
    if (!bot) throw new NoBotSelected("Bot with ID " + (botId || 0) + " not initialized");
    return new KeyboardClass(bot, isInline);
}

export class KeyboardClass {
    private _service: TelegramBot;
    private _inline: boolean;
    private keyboard: Button[][] = [[]];
    private _hasOptional: boolean | undefined;
    private _optionals: Map<number, Function> | undefined;
    private _row = 0;
    private _rollback: boolean | undefined;
    display: string | Function | undefined;

    constructor(service: TelegramBot, isInline: boolean) {
        this._service = service;
        this._inline = isInline;
    }

    get service(): TelegramBot {
        return this._service;
    }

    get inline(): boolean {
        return this._inline;
    }

    get height(): number {
        return this._row;
    }

    /*
     * Text button
     */
    Text(this: any, text: string) {
        this.keyboard[this._row].push({ text, ...(this._inline && { callback_data: ' ' }) });
        return this;
    }

    /*
     * Link button
     */
    Url(this: any, text: string, url: string) {
        this.keyboard[this._row].push({ text, url });
        return this;
    }

    /*
     * Starts a new buttons row
     */
    Row() {
        this._row += 1;
        this.keyboard[this._row] = [] as Button[];
        return this;
    }

    /*
     * Don't resize reply keyboard
     */
    Rollback() {
        this._rollback = true;
        return this;
    }
    
    /*
     * Concatenate with another keyboard, row or button
     */
    Add(this: any, object: KeyboardClass[] | KeyboardClass | Button[][] | Button[] | Button) {
        if (Array.isArray(object)) { // [{ text: "" },{}] - row
            if (Array.isArray(object[0])) {
                object.forEach(row => { this.keyboard.push(row); this._row++ })
            }
            else {
                if (typeof object[0] === 'object' && "keyboard" in object[0]) {
                    (object[0] as KeyboardClass).keyboard.forEach((row: Button[]) => {
                        this.keyboard.push(row);
                        this._row++;
                    });
                }
                else {
                    this.keyboard.push(object);
                    this._row++;
                }
            }
        }
        else {
            if ('Build' in object) {
                object.keyboard.forEach(row => { this.keyboard.push(row); this._row++ })
            }
            else if (this.keyboard[this._row].length === 8) this.keyboard.push([ object ]) // add button
            else this.keyboard[this._row].push(object)
        }
        if (this.keyboard[0].length === 0) {
            this.keyboard.shift()
            this._row--;
        }
        return this;
    }
    
    /*
     * Optional keyboard part
     */
    Optional(func: Function) {
        if (!this._hasOptional || !this._optionals) {
            this._optionals = new Map();
            this._hasOptional = true;
        }
        const position = this.keyboard[this._row].length + this._row * 8; // knowing that maximum row size is 8
        this.keyboard[this._row].push({ text: ' ', ...(this._inline && { callback_data: ' ' }) });
        this._optionals.set(position, func);
        return this;
    }

    /*
     * Action button
     * @param text
     * @param {Function | name} action Function with name OR function name (if it's being registered)
     * @param [args] Arguments (optional)
     */
    Callback(text: string, action: Function | string, ...args: any[] | undefined[]) {
        if (this._inline) {
            let unsigned;
            const strArgs = (args?.length ? (' ' + args?.join(' ')) : ''); // stringified args

            if (typeof action !== 'string') {
                // todo warning with anon functions
                if (action.name === 'anon') {
                    const id = randomCbName()
                    this._service.registerAnon(id, action)
                    unsigned = id + strArgs;
                }
                else {
                    if (!this._service.hasCallback(action)) this._service.register(action);
                    unsigned = action.name + strArgs;
                }
            }
            else {
                unsigned = action + strArgs;
            }

            const callback_data = this._service.requireSig() ? (this._service.sig(unsigned) + ' ' + unsigned) : unsigned;

            this.keyboard[this._row].push({
                text, callback_data
            });

            return this;
        }
        else {
            if (args.length) throw new Error("Sorry! As for now, reply keyboards can't have arguments")

            if (!this._service.hasTextCallback(text)) {
                const func = typeof action === 'function' ? action : (c: Context) => c.reply(action)
                this._service.text(text, func);
            }

            this.keyboard[this._row].push({
                text//, callback_data: ' '
            })

            return this;
        }
    }

    async Build(ctx?: Context): Promise<Record<string, any>> {
        const keyboard = this.keyboard;
        if (this._hasOptional && this._optionals) {
            for (const [ id, func ] of this._optionals) {
                const button = await func(ctx);
                const row = Math.floor(id / 8)
                if (button) keyboard[row][id % 8] = button;
                else keyboard[row].splice(id % 8, 1)
            }
        }
        
        if (this._inline) return { inline_keyboard: keyboard }
        else return {
            keyboard,
            ...(!this._rollback && { resize_keyboard: true })
        }
    }

    Display(display: string | Function) {
        this.display = display;
        return this;
    }

    async open(ctx: Context, reply?: boolean) {
        if (!this.display) throw new Error("Tried to open a panel that had no text (add using .Text(...)")

        const text = typeof this.display === 'function' ? await this.display(ctx) : this.display;

        const result = await (reply ? ctx.reply(text, this) : ctx.respond(text, this))

        const opened = new OpenedKeyboard(this, ctx)

        return {
            ...result,
            instance: opened
        }
    }
}

export class OpenedKeyboard {
    keyboard: KeyboardClass;
    context: Context;
    refresher!: any;

    constructor(keyboard: KeyboardClass, ctx: Context) {
        this.keyboard = keyboard;
        this.context = ctx;
    }

    update(seconds: number) {
        this.refresher = setInterval(async () => {
            if (!this.keyboard.display) return clearInterval(this.refresher);
            const display = typeof this.keyboard.display === 'function' ? await this.keyboard.display()
                                                                        : this.keyboard.display;
            const result = await this.context.edit(display, this.keyboard)
            if (!result.ok) {
                console.warn("Stopped update interval because: " + result.error)
                clearInterval(this.refresher)
            }
        }, seconds * 1000)
        return this;
    }

    refresh() {
        if (!this.keyboard.display) return null;
        return this.context.edit(this.keyboard.display, this.keyboard)
    }

    close() {
        if (this.refresher) clearInterval(this.refresher)
    }
}
