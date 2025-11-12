import { TelegramBot } from '$'
import { INSTANCES, BOT_IDS } from '$/store'
import { NoBotSelected } from '$/errors'

/**
 * Serialized button
 */
export interface Button {
    text: string;
    callback_data: string;
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
    return createKeyboard(botId, false);
}

/*
 * Creates inline keyboard
 * @param {number} [botId] Bot ID (optional)
 */
export function Panel(botId: number | undefined) {
    return createKeyboard(botId, true);
}

function createKeyboard(botId: number | undefined, isInline: boolean): KeyboardClass {
    const bot = INSTANCES[botId || BOT_IDS[0]];
    if (!bot) throw new NoBotSelected("Bot with ID " + (botId || 0) + " not initialized");
    return new KeyboardClass(bot, isInline);
}

export class KeyboardClass {
    private _service: TelegramBot;
    private _inline: boolean;
    private keyboard: Button[][]  = [[]];
    private _row = 0;
    private _rollback: boolean | undefined;

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
                    //object.forEach(row => { this.keyboard.push([ row ]); this._row++ });
                }
            }
        }
        else {
            if (this.keyboard[this._row].length === 8) this.keyboard.push([ object ]) // add button
            else this.keyboard[this._row].push(object)
        }
        if (this.keyboard[0].length === 0) {
            this.keyboard.shift()
            this._row--;
        }
        return this;
    }
    
    /*
     * Action button
     * @param text
     * @param {Function | name} action Function with name OR function name (if it's being registered)
     * @param [args] Arguments (optional)
     */
    Callback(this: any, text: string, action: Function | string, ...args: any[] | undefined[]) {
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
            if (this.args.length) throw new Error("Sorry! As for now, reply keyboards can't have arguments")

            if (!this._service.hasTextCallback(text, action)) {
                this._service.text(text, action);
            }

            this.keyboard[this._row].push({
                text, callback_data: ' '
            })

            return this;
        }
    }

    Build(): Record<string, any> {
        if (this._inline) return { inline_keyboard: this.keyboard }
        else return {
            keyboard: this.keyboard,
            ...(!this._rollback && { resize_keyboard: true })
        }
    }
}

