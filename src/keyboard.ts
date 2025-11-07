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
    Build(): SerializedBtn[][];
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
 * @param action Function with name (not anon)
 * @param [args] Arguments (optional)
 */
function Callback(this: any, text: string, action: Function, ...args: any[] | undefined[]) {
    if (!this._bot.hasCallback(action)) this._bot.register(action);
    
    const unsigned = action.name + (args?.length ? (' ' + args?.join(' ')) : '');
    
    const data = this._bot.requireSig() ? (this._bot.sig(unsigned) + ' ' + unsigned) : unsigned;
    
    this._keyboard[this._row].push({
        text,
        data,
    });
    
    return this;
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
        Build: () => _keyboard,
    };
    
    obj.Row = obj.Row.bind(obj);
    obj.Text = obj.Text.bind(obj);
    obj.Callback = obj.Callback.bind(obj);
    
    return obj;
}

