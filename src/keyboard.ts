import { INSTANCES, BOT_IDS } from './store'
import { NoBotSelected } from './errors'

/**
 * Готовая к отправке кнопка
 */
export interface SerializedBtn {
    text: string;
    data: string;
    url?: string;
}

/*
 * Интерфейс для любой клавиатуры
 */
export interface KeyboardInterface {
    Build(): SerializedBtn[][];
}

/*
 * Начинает новый ряд
 * @param [buttons] Массив кнопок (опционально)
 */
function Row() {
    /*if(this._row !== 0 || this._keyboard[0].length) */this._row += 1;
    this._keyboard[this._row] = /*buttons || */[];
    return this;
}

/*
 * Текстовая кнопка
 */
function Text(this: any, text: string) {
    this._keyboard[this._row].push({ text });
    return this;
}

/*
 * Кнопка с действием
 * @param text Текст на кнопке
 * @param action Именная функция
 * @param [args] Аргументы
 */
function Callback(this: any, text: string, action: Function, ...args: any[] | undefined[]) {
    if (!this._hasCallback(action)) this._register(action);
    
    const unsigned = action.name + (args?.length ? (' ' + args?.join(' ')) : '');
    
    const data = this._sigRequired ? (this._sig(unsigned) + ' ' + unsigned) : unsigned;
    
    console.log(data);
    
    this._keyboard[this._row].push({
        text,
        data,
    });
    
    return this;
}

/*
 * Создание клавиатуры
 * @ param {number} [botId] ID бота (опционально)
 */
export function Keyboard(botId: number | undefined) {
    const bot = INSTANCES[botId || BOT_IDS[0]];
    if (!bot) throw new NoBotSelected("Бот с id " + (botId || 0) + " не инициализирован");
    
    const _keyboard: SerializedBtn[][] = [[]];
    const _row = 0;
    
    const obj = {
        _keyboard,
        _row,
        _register: bot.register.bind(bot),
        _hasCallback: bot.hasCallback.bind(bot),
        _sigRequired: bot.requireSig(),
        _sig: bot.sig.bind(bot),
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

