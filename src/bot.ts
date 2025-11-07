import { KeyboardInterface, SerializedBtn } from './keyboard'
import { INSTANCES, BOT_IDS } from './store'
import { NoBotSelected, NamelessCallback, CallbackNotFound, CallbackOverride, OptionsError,
         ParserError, FileNotFound } from './errors'
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface BotOptions {
    token: string;
    signCallbacks: boolean | undefined;
    signLength: number | undefined;
}

export interface MessageOpts {
    text?: string | undefined;
    caption?: string | undefined;
    keyboard?: SerializedBtn[][] | KeyboardInterface;
    file?: File;
    spoiler?: boolean;
    [key: string]: any;
}

export interface File {
    photo?: string;
    audio?: string;
    document?: string;
    animation?: string;
    voice?: string;
}

export function Image(path: string): MessageOpts {
    return {
        file: {
            photo: path
        }
    }
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
    started = false;

    /*
     * Register function as a callback
     * @param {Function[]} ...fs Registering functions
     */
    register(...fs: Function[]) {
        for (const func of fs) {
            if (this.started && func.name === "anon")
                throw new NamelessCallback("Can't create callbacks after starting the bot (unsafe for reloads)");

            if (!this.allow_override && this.callbacks[func.name])
                throw new CallbackOverride("Callback with name " + func.name + " already registered!");
            
            this.callbacks[func.name] = func;
        }
    }

    hasCallback(func: Function) {
        return !!this.callbacks[func.name];
    }

    protected async handleCallback(ctx: any, name: string, args: any[]) {
        if (!this.callbacks[name]) {
            const err = new CallbackNotFound("Callback function wasn't registered. Function name: " + name 
                                           + "\nPossible cause: Keyboard() was created with Callback() outside the main script");
            if ((this as any).shouldThrow(err)) throw err;
            return false;
        }
        
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
    parseMode: string | null = null;
    
    /*
     * Sending a message
     * @param {number} chatId Chat ID
     * @param {string} text Text to send
     * @param {MessageOpts} [options] Message options
     * @throws {ParserError} Being thrown when there's unclosed tags, etc
     */
    async sendMessage(chatId: number, text: string, options?: MessageOpts | KeyboardInterface) {
        if (options && "file" in options && options.file) {
            const body: any = { chat_id: chatId, caption: text };
            
            this.includeOptions(body, options);
            
            if (this.parseMode) body.parse_mode = this.parseMode;
            
            const { file } = options;
            
            let res;
            
            const type = Object.keys(options.file)[0];
            const data: string = (options.file as any)[type];
            const method = "send" + type[0].toUpperCase() + type.slice(1);
            
            if (!data.startsWith(".") && !data.startsWith("/")) {
                body.photo = data;
                
                res = await this.call(method, body);
            }
            else {
                const blob = await this.loadBlob(data);
                if (!blob) return null;
                const form = new FormData();
                Object.keys(body).forEach(k => {
                    if (typeof body[k] === 'string') form.append(k, body[k]);
                    else form.append(k, JSON.stringify(body[k]))
                });
                form.append(type, blob, "photo.jpg");
                res = await this.call(method, form);
            }
            
            return res ? res.json() : null;
        }
        else {
            const body: any = { chat_id: chatId, text };
            
            if (options) this.includeOptions(body, options);
            
            if (this.parseMode) body.parse_mode = this.parseMode;
            
            const res = await this.call("sendMessage", body);
            
            const parsed = await res.json();
            
            if (parsed.ok === false) {
                if (parsed.description.slice(13, 33) === "can't parse entities") {
                    const err = new ParserError(parsed.description.slice(35));
                    if ((this as any).shouldThrow(err)) throw err;
                }
            }
            
            return parsed;
        }
    }
    
    protected async loadBlob(path: string) {
        let fileBuffer;

        try {
            fileBuffer = await readFile(path);
        } catch (e: any) {
            if (e.code === "ENOENT") {
                const error = new FileNotFound("File not found: " + path);
                if ((this as any).shouldThrow(error)) throw error;
                else return null;
            }
            else throw e;
        }

        return new Blob([ fileBuffer ]);
    }
    
    /*
     * Including arguments
     */
    protected includeOptions(body: any, options: MessageOpts | KeyboardInterface) {
        if ("Build" in options) {
            body.reply_markup = (this as any).getKeyboardMarkup(options);
        }
        else if ("keyboard" in options) {
            body.reply_markup = (this as any).getKeyboardMarkup(options.keyboard);
        }
    }

    /*
     * Message editing
     * @param {number} chatId
     * @param {number} messageId
     * @param {MessageOpts} options
     */
    async editMessage(chatId: number, messageId: number, options: MessageOpts) {
        if (options.file) {
            const type = Object.keys(options.file)[0];
            const data: string = (options.file as any)[type]; // either document ID, URL or local path
            
            if (data.startsWith(".") || data.startsWith("/")) {
                const body: any = {
                    chat_id: chatId,
                    message_id: messageId,
                    media: {
                        type,
                        caption: options.text || undefined,
                        media: "attach://document",
                    }
                }
                
                this.includeOptions(body, options);
                
                if (options.spoiler === true) body.media.has_spoiler = true;
                if (this.parseMode) body.media.parse_mode = this.parseMode;
                
                const blob = await this.loadBlob(data); // path
                if (!blob) return null;
                const form = new FormData();
                
                Object.keys(body).forEach(k => {
                    if (typeof body[k] === 'string') form.append(k, body[k]);
                    else form.append(k, JSON.stringify(body[k]))
                });
                
                form.append("document", blob, "photo.jpg");
                
                const res = await fetch(`${(this as any).apiUrl}/editMessageMedia`, {
                    method: "POST",
                    body: form,
                });
                
                const parsed = await res.json();
            
                return parsed;
            }
            else {
                const body: any = {
                    chat_id: chatId,
                    message_id: messageId,
                    media: {
                        type,
                        caption: options.text || undefined,
                        media: data,
                    }
                }
                
                this.includeOptions(body, options);
                
                if (options.spoiler === true) body.media.has_spoiler = true;
                if (this.parseMode) body.media.parse_mode = this.parseMode;
                
                const res = await fetch(`${(this as any).apiUrl}/editMessageMedia`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                
                const parsed = await res.json();
                
                return parsed;
            }
        }
        else if ("text" in options && options.text) {
            const body: any = { chat_id: chatId, message_id: messageId, text: options.text }
            
            this.includeOptions(body, options); // keyboard, image, etc
            
            const res = await fetch(`${(this as any).apiUrl}/editMessageText`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            
            const parsed = await res.json();
            
            return parsed;
        }
        else if ("caption" in options && options.caption) {
            const body: any = { chat_id: chatId, message_id: messageId, caption: options.text }
            
            this.includeOptions(body, options);
            
            const res = await fetch(`${(this as any).apiUrl}/editMessageCaption`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            
            const parsed = await res.json();
            
            return parsed;
        }
    }
    
    /*
     * Reacting to message
     */
    async react(chatId: number, messageId: number, reaction: string, big?: boolean) {
        const body = {
            chat_id: chatId,
            message_id: messageId,
            reaction: [{ type: "emoji", emoji: reaction }],
            ...(big ? { is_big: true } : {})
        }
        return this.call("setMessageReaction", body);
    }
    
    /*
     * Calling any Telegram Bot API functions
     * @param {string} method
     * @param {FormData | any} arguments Data to be send
     */
    async call(method: string, data: FormData | any) {
        if (data instanceof FormData) {
            return await fetch(`${(this as any).apiUrl}/${method}`, {
                method: "POST",
                body: data,
            });
        } else {
            return await fetch(`${(this as any).apiUrl}/${method}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
        }
    }
    
    /*
     * Internal functions to handle different variants of arguments
     * And also to use the same argument for caption and text
     */
    protected async identifyEdit(ctx: any, argument1: string | MessageOpts | KeyboardInterface,
                                           argument2?: MessageOpts | KeyboardInterface) {
        if (!ctx.message?.chat?.id) throw new Error("Can't edit outside callback context")
        const chat_id = ctx.message?.chat?.id;
        
        if (typeof argument1 === 'string') {
            const body: any = "Build" in (argument2 || {}) ? { keyboard: argument2 } : argument2 || {};
            
            if (!ctx.message.text) {
                return this.editMessage(chat_id, ctx.message.message_id, {
                    ...body,
                    caption: argument1
                })
            }
            else {
                return this.editMessage(chat_id, ctx.message.message_id, {
                    ...body,
                    text: argument1
                })
            }
        }
        else {
            const body: any = "Build" in argument1 ? { keyboard: argument1 } : argument1;
            
            if (!ctx.message.text) {
                return this.editMessage(chat_id, ctx.message.message_id, {
                    ...body,
                    caption: body.text || body.caption // TODO separate interface for message opts - to exclude caption
                })
            }
            else {
                return this.editMessage(chat_id, ctx.message.message_id, {
                    ...body,
                    text: body.text || body.caption
                })
            }
        }
    }
    
    protected async identifyReply(ctx: any, argument: string | MessageOpts, options: MessageOpts | undefined) {
        const chat_id = ctx.message?.chat?.id || ctx.from.id;
        const stringPassed = typeof argument === 'string';
        if (stringPassed) return this.sendMessage(chat_id, argument, options || {});
        else if (!stringPassed && argument?.text) return this.sendMessage(chat_id, argument.text, argument);
    }

    protected async answerCallbackQuery(id: string, text: string) {
        await fetch(`${(this as any).apiUrl}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: id, text }),
        });
    }
}

type ParserName = 'HTML' | 'MarkdownV2' | 'Markdown' | null;

class ParseModeManager {
    /*
     * Sets message parser
     * @param {ParserName} name Parser name (HTML, MarkdownV2, Markdown or null)
     */ 
    setParser(name: ParserName) {
        (this as any).parseMode = name;
    }
}

class ErrorManager {
    exception: (new (...args: any[]) => Error)[] = [];

    /*
     * Don't throw exception
     * @param {...(new (...args: any[]) => Error)} errors List of exceptions
     */
    dontThrow(...errors: (new (...args: any[]) => Error)[]) {
        errors.forEach(e => this.exception.push(e));
    }

    shouldThrow(err: Error) {
        return !this.exception.some(ex => err instanceof ex);
    }
}

class KeyboardManager {
    protected serializeKeyboard(keyboard: SerializedBtn[][]) {
        return keyboard.map(row => row.map(btn => {
            if (btn.url) return { text: btn.text, url: btn.url }
            return { text: btn.text, callback_data: btn.data || ' ' }
        }));
    }
    
    protected getKeyboardMarkup(keyboard: KeyboardInterface) {
        if (keyboard._inline) {
            return { inline_keyboard: this.serializeKeyboard(keyboard.Build()) }
        }
        else {
            return { keyboard: this.serializeKeyboard(keyboard.Build()) }
        }
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

const allowedHandlers = new Set([
    'quote', 'reply_to_story', 'reply_to_checklist_task_id', 'text',
    'animation', 'audio', 'document', 'paid_media', 'photo', 'sticker',
    'story', 'video', 'video_note', 'voice', 'caption', 'checklist',
    'contact', 'dice', 'game', 'poll', 'venue', 'location',
    'new_chat_members', 'left_chat_member', 'new_chat_title', 'new_chat_photo',
    'delete_chat_photo', 'group_chat_created', 'supergroup_chat_created',
    'channel_chat_created', 'message_auto_delete_timer_changed', 'migrate_to_chat_id',
    'migrate_from_chat_id', 'pinned_message', 'invoice', 'successful_payment',
    'refunded_payment', 'users_shared', 'chat_shared', 'gift', 'unique_gift',
    'connected_website', 'write_access_allowed', 'passport_data',
    'proximity_alert_triggered', 'boost_added', 'chat_background_set',
    'checklist_tasks_done', // add rest
])

interface Handler {
    action: string | undefined;
    requires?: any;
    func: Function;
}

class HandlerManager {
    handlers: Handler[] = [];
    addedHandlers: Set<string | undefined> = new Set();
    
    on(match: string | RegExp, func: Function) {
        if (typeof match !== 'string') {
            this.addHandler('text', func, match);
        }
        else {
            if (match === 'callback') this.addHandler('callback_query', func)
            else if (allowedHandlers.has(match)) this.addHandler(match, func)
            else this.addHandler('text', func, new RegExp(match))
        }
    }
    
    use(func: Function) {
        this.handlers.push({
            action: undefined,
            func
        })
        this.addedHandlers.add(undefined)
    }
    
    protected addHandler(action: string, func: Function, requires?: any) {
        this.handlers.push({
            action,
            requires,
            func
        })
        this.addedHandlers.add(action)
    }
    
    protected async handle(context: Context, name: string) {
        if (!this.addedHandlers.has(name)) return false;
        for (const handler of this.handlers) {
            if (handler.action !== name) continue;
            if (handler.action === "text" && !handler.requires.test(context.text)) continue;
            const result = await handler.func(context);
            if (!!result) return true;
        }
        return false;
    }
}

function tinySig(text: string, signLength: number): string {
    const hash = createHash("sha256").update(text, "utf8").digest();
    return hash.toString("base64").substring(0, signLength);
}

class Polling extends CallbackManager {
    started = false;
    handlers: Handler[] = [];
    onUpdate: (msg: any) => void = () => {};
    addedHandlers: Set<string | undefined> = new Set();
    
    protected async startPolling(onUpdate: (msg: any) => void) { // eslint-disable-line no-unused-vars
        this.started = true;
        this.onUpdate = onUpdate;
        let offset = 0;
        while (true) {
            const res = await fetch(`${(this as any).apiUrl}/getUpdates?offset=${offset}&timeout=30`);
            const data = await res.json();
            if (!data.result?.length) continue;

            for (const update of data.result) {
                const context = (this as any).Context(update);
                this.processUpdate(context, update);
                offset = update.update_id + 1;
            }
        }
    }
    
    protected async processUpdate(context: Context, update: any) {
        //const stopped = await (this as any).handle(context);
        // if any middleware returns "true", then chain stops
        
        handleMiddleware: {
            if (update.callback_query) {
                const stopped = await (this as any).handle(context, 'callback_query')
                if (stopped) break handleMiddleware;
                
                const { id, data } = context;
                
                if (data !== ' ') {
                    const args = data.split(' ');
                    if ((this as any).signCallbacks === true) {
                        const sigIndex = data.indexOf(' ');
                        
                        if ((this as any).sig(data.slice(sigIndex + 1)) !== data.slice(0, sigIndex)) {
                            console.warn("Wrong signature");
                        }
                        else await this.handleCallback(context, args[1], args.slice(2));
                    } else {
                        await this.handleCallback(context, args[0], args.slice(1));
                    }
                }
                
                (this as any).answerCallbackQuery(id, context._query || ' ');
            }
            else {
                for (const { action, requires, func } of this.handlers) {
                    if (action && !context[action]) continue;
                    if (action === "text" && !requires.test(context.text)) continue;
                    if (!!await func(context)) break;
                }
            }
        }
        
        if(this.onUpdate !== undefined) await this.onUpdate(update);
    }
    
    private Context(update: any): Context {
        const ctx: any = update.callback_query || update.message;
        if (!ctx) throw new Error("Sorry, unsupported context!" + update);
        
        const object = {
            ...ctx,
            reply: (argument: string | MessageOpts, options?: MessageOpts) =>
                (this as any).identifyReply(ctx, argument, options),
        };
        
        if (update.callback_query) {
            object.edit = (argument1: string | MessageOpts | KeyboardInterface,
                           argument2?: MessageOpts | KeyboardInterface) => (this as any).identifyEdit(ctx, argument1, argument2);
        }
        else {
            object.react = (emoji: string, big?: boolean) => (this as any).react(ctx.chat.id, ctx.message_id, emoji, big);
        }
        
        return object;
    }
}

interface Context {
    reply: (argument: string | MessageOpts, options?: MessageOpts) => any;
    edit: (argument: string | MessageOpts) => any;
    query: string | undefined;
    [key: string]: any;
}

class TelegramBotBase {}

interface TelegramBotBase
    extends BotInstance,
        CallbackManager,
        KeyboardManager,
        MessageSender,
        ParseModeManager,
        ErrorManager,
        HandlerManager,
        CallbackSigner,
        Polling {}

applyMixins(TelegramBotBase, [
    BotInstance,
    CallbackManager,
    KeyboardManager,
    MessageSender,
    ParseModeManager,
    ErrorManager,
    HandlerManager,
    CallbackSigner,
    Polling,
]);


export class TelegramBot extends TelegramBotBase {
    callbacks: Record<string, Function> = {};
    handlers: Handler[] = [];
    addedHandlers: Set<string | undefined> = new Set();
    allow_override = false;
    mode = 0;
    parseMode: string | null = null;
    exception: (new (...args: any[]) => Error)[] = [];
    signCallbacks = true;
    signLength = 4;
    started = false;

    constructor(options: BotOptions | string) {
        super();

        let token: string;

        if (typeof options === "string") token = options;
        else {
            token = options.token;
            if (options.signCallbacks !== undefined) this.signCallbacks = options.signCallbacks;
            if (options.signLength !== undefined) this.signLength = options.signLength;
        }

        if (!token) throw new OptionsError("Wrong token");

        (this as any).initBot(token);
    }
}

