import { KeyboardInterface, SerializedBtn } from './keyboard'
import { INSTANCES, BOT_IDS } from './store'
import { OptionsError, NamelessCallback, CallbackOverride } from './errors'
import { createHash } from "crypto";

export interface BotOptions {
    token: string;
    signCallbacks: boolean | undefined;
    signLength: number | undefined;
}

export interface MessageOpts {
    keyboard?: SerializedBtn[][] | KeyboardInterface;
    [key: string]: any;
}

class BotInstance {
    token!: string;
    apiUrl!: string;

    protected initBot(token: string) {
        this.token = token;
        this.apiUrl = `https://api.telegram.org/bot${token}`;
        const botId = parseInt(token.split(':')[0]);
        INSTANCES[botId] = this as any;
        BOT_IDS.unshift(botId);
    }
}

function applyMixins(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            if (name !== "constructor") {
                Object.defineProperty(
                    derivedCtor.prototype,
                    name,
                    Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null)
                );
            }
        });
    });
}

class CallbackManager {
    callbacks!: Record<string, Function>;
    allow_override = false;
    mode = 0;
    
    /*
     * Регистрация функции для колбека
     * @param {Function[]} ...fs Регистрируемые именные функции
     */
    register(...fs: Function[]) {
        for (const func of fs) {
            if (this.mode !== 1 && func.name === "anon")
                throw new NamelessCallback("В режиме NamedCallbacks запрещены безымянные функции");

            if (!this.allow_override && this.callbacks[func.name])
                throw new CallbackOverride("В режиме allow_override = false запрещено переназначать callbacks");
            
            this.callbacks[func.name] = func;
        }
    }
    
    hasCallback(func: Function) {
        return this.callbacks[func.name] !== undefined;
    }

    protected async handleCallback(ctx: any, name: string, args: any[]) {
        const fixedArgs: any[] = [];

        for (const arg of args) {
            if (arg === 'false') fixedArgs.push(false);
            else if (arg === 'true') fixedArgs.push(true);
            else if (arg === 'undefined') fixedArgs.push(undefined);
            else if (arg === 'NaN') fixedArgs.push(NaN);
            else if (arg === 'null') fixedArgs.push(null);
            else if (arg === 'Infinity') fixedArgs.push(Infinity);
            else if (!isNaN(Number(arg))) fixedArgs.push(Number(arg));
            else fixedArgs.push(arg);
        }

        this.callbacks[name](ctx, ...fixedArgs);
    }
}

class MessageSender {
    /*
     * Отправка сообщения
     * @param {number} chatId ID чата
     * @param {string} text Текст для отправки
     * @param {MessageOpts} [options] Параметры сообщения
     */
    async sendMessage(chatId: number, text: string, options?: MessageOpts) {
        const body: any = { chat_id: chatId, text };
        
        if (options?.keyboard) {
            body.reply_markup = (this as any).getKeyboardMarkup(options.keyboard);
        }
        
        const res = await fetch(`${(this as any).apiUrl}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        
        return res.json();
    }

    protected async answerCallbackQuery(id: string, text: string) {
        await fetch(`${(this as any).apiUrl}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: id, text }),
        });
    }
    
    protected async reply(ctx: any, text: string, options?: MessageOpts) {
        const chat_id = ctx.message?.chat?.id || ctx.from.id;
        return this.sendMessage(chat_id, text, options);
    }
}

class KeyboardManager {
    protected serializeKeyboard(keyboard: SerializedBtn[][] | KeyboardInterface) {
        return Array.isArray(keyboard) ? keyboard.map(row => row.map(btn => ({ text: btn.text, callback_data: btn.data || ' ' })))
                                       : keyboard.Build().map(row => row.map(btn => ({ text: btn.text, callback_data: btn.data || ' ' })));
    }

    protected getKeyboardMarkup(keyboard: SerializedBtn[][] | KeyboardInterface) {
        return { inline_keyboard: this.serializeKeyboard(keyboard) };
    }
}

class CallbackSigner {
    signCallbacks = true;
    signLength = 4;
    token!: string;

    sig(data: string) {
        return tinySig(data + this.token, this.signLength);
    }

    requireSig() {
        return this.signCallbacks;
    }
}

class HandlerManager {
    textHandlers!: any[];
    
    on(match: string | RegExp, func: Function) {
        const regex = typeof match === 'string' ? new RegExp(match) : match;
        
        this.textHandlers.push({
            regex,
            func
        })
    }
}

function tinySig(text: string, signLength: number): string {
    const hash = createHash("sha256").update(text, "utf8").digest();
    return hash.toString("base64").substring(0, signLength);
}

class Polling extends CallbackManager {
    protected async startPolling(onUpdate: (msg: any) => void) { // eslint-disable-line no-unused-vars
        let offset = 0;
        while (true) {
            const res = await fetch(`${(this as any).apiUrl}/getUpdates?offset=${offset}&timeout=30`);
            const data = await res.json();
            if (!data.result?.length) continue;

            for (const update of data.result) {
                if (update.callback_query) {
                    const { id, data } = update.callback_query;
                    
                    if (!data) continue;
                    const args = data.split(' ');

                    if ((this as any).signCallbacks) {
                        
                        const sigIndex = data.indexOf(' ');
                        if ((this as any).sig(data.slice(sigIndex + 1)) !== data.slice(0, sigIndex)) {
                            console.warn("Wrong signature");
                        }
                        else this.handleCallback((this as any).Context(update), args[1], args.slice(2));
                    } else {
                        
                        this.handleCallback((this as any).Context(update), args[0], args.slice(1));
                    }
                    (this as any).answerCallbackQuery(id, ' ');
                } else if (update.message?.text?.length) {
                    for (const { regex, func } of (this as any).textHandlers) {
                        console.log(regex, update.message.text);
                        if (regex.test(update.message.text)) {
                            func((this as any).Context(update));
                            break;
                        }
                    }
                }
                
                if(onUpdate !== undefined) onUpdate(update);
                
                offset = update.update_id + 1;
            }
        }
    }
    
    private Context(update: any) {
        return {
            ...update.callback_query,
            reply: (text: string, options?: MessageOpts) =>
                (this as any).reply(update.callback_query || update.message, text, options),
        };
    }
}

class TelegramBotBase {}

interface TelegramBotBase
    extends BotInstance,
        CallbackManager,
        KeyboardManager,
        MessageSender,
        HandlerManager,
        CallbackSigner,
        Polling {}

applyMixins(TelegramBotBase, [
    BotInstance,
    CallbackManager,
    KeyboardManager,
    MessageSender,
    HandlerManager,
    CallbackSigner,
    Polling,
]);


export class TelegramBot extends TelegramBotBase {
    callbacks: Record<string, Function> = {};
    textHandlers: any[] = [];
    allow_override = false;
    mode = 0;
    signCallbacks = true;
    signLength = 4;

    constructor(options: BotOptions | string) {
        super();

        let token: string;

        if (typeof options === "string") token = options;
        else {
            token = options.token;
            if (options.signCallbacks !== undefined) this.signCallbacks = options.signCallbacks;
            if (options.signLength !== undefined) this.signLength = options.signLength;
        }

        if (!token) throw new OptionsError("Не указан токен");

        (this as any).initBot(token);
    }
}

