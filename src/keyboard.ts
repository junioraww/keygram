import { INSTANCES, BOT_IDS } from './store'
import { NoBotSelected } from './errors'

/**
 * Serialized button
 */
export interface SerializedBtn {
    text: string;
    data: string;
    url?: string;
}

/*
 * Any keyboard interface
 */
export interface KeyboardInterface {
    _row: number;
    _keyboard: SerializedBtn[][];
    _inline: boolean;
    Row: () => KeyboardInterface;
    Build(): Record<string, any>;
}

/*
 * Start a new row
 */
function Row(this: KeyboardInterface) {
    this._row += 1;
    this._keyboard[this._row] = [] as SerializedBtn[];
    return this;
}

/*
 * Text button
 */
function Text(this: any, text: string) {
    this._keyboard[this._row].push({ text });
    return this;
}

/*
 * Link button
 */
function Url(this: any, text: string, url: string) {
    this._keyboard[this._row].push({ text, url });
    return this;
}

/*
 * Action button
 * @param text
 * @param {Function | name} action Function with name OR function name (if it's being registered)
 * @param [args] Arguments (optional)
 */
function Callback(this: any, text: string, action: Function | string, ...args: any[] | undefined[]) {
    if (this._inline) {
        let unsigned;
        const strArgs = (args?.length ? (' ' + args?.join(' ')) : ''); // stringified args
        
        if (typeof action !== 'string') {
            // todo warning with anon functions
            console.log(action.name)
            if (action.name === 'anon') {
                const id = randomCbName()
                this._bot.registerAnon(id, action)
                unsigned = id + strArgs;
            }
            else {
                if (!this._bot.hasCallback(action)) this._bot.register(action);
                unsigned = action.name + strArgs;
            }
        }
        else {
            unsigned = action + strArgs;
        }
        
        const data = this._bot.requireSig() ? (this._bot.sig(unsigned) + ' ' + unsigned) : unsigned;
        
        this._keyboard[this._row].push({
            text,
            data,
        });
        
        return this;
    }
    else {
        if (this.args.length) throw new Error("Sorry! As for now, reply keyboards can't have arguments")
        
        if (!this._bot.hasTextCallback(text, action)) {
            this._bot.text(text, action);
        }
        
        this._keyboard[this._row].push({
            text
        })
        
        return this;
    }
}

function randomCbName(): string {
    return btoa(Math.random().toString()).slice(2, 8)
}

/*
 * Returns reply_markup entry for this keyboard
 */
function Build(this: KeyboardInterface): Record<string, any> {
    const buttons = this._keyboard.map((row: SerializedBtn[]) => row.map(btn => {
        if (btn.url) return { text: btn.text, url: btn.url }
        return { text: btn.text, callback_data: btn.data || ' ' }
    }));
    if (this._inline) return { inline_keyboard: buttons }
    else return { keyboard: buttons }
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

function createKeyboard(botId: number | undefined, inline: boolean): KeyboardInterface {
    const bot = INSTANCES[botId || BOT_IDS[0]];
    if (!bot) throw new NoBotSelected("Бот с id " + (botId || 0) + " не инициализирован");
    
    const _keyboard: SerializedBtn[][] = [[]];
    const _row = 0;
    
    const obj = {
        _keyboard,
        _row,
        _bot: bot,
        _inline: inline,
        Row,
        Text,
        Callback,
        Build,
    };
    
    obj.Row = obj.Row.bind(obj);
    obj.Text = obj.Text.bind(obj);
    obj.Callback = obj.Callback.bind(obj);
    obj.Build = obj.Build.bind(obj);
    
    return obj;
}

