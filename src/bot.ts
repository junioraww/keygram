import { KeyboardInterface, SerializedBtn } from './keyboard'
import { INSTANCES, BOT_IDS } from './store'
import { NoBotSelected, NamelessCallback, CallbackNotFound, CallbackOverride, OptionsError,
         ParserError, FileNotFound } from './errors'
import { StateManager, StateManagerMixin } from './mixins/states'
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
                throw new NamelessCallback("Can't register anon function outside Keyboard()");

            if (!this.allow_override && this.callbacks[func.name])
                throw new CallbackOverride("Callback with name " + func.name + " already registered!");

            this.callbacks[func.name] = func;
        }
    }

    protected registerAnon(cb_name: string, func: Function) {
        this.callbacks[cb_name] = func;
    }

    hasCallback(func: Function) {
        return !!this.callbacks[func.name];
    }

    hasTextCallback(text: string, func: Function) {
        return (this as any).handlers.findIndex((h: any) => h.update === "message"
                                             && h.key === "text"
                                             && h.value === text) !== -1
    }

    protected async handleCallback(ctx: any, name: string, args: any[] = []) {
        if (!this.callbacks[name]) {
            const err = new CallbackNotFound("Callback function wasn't registered. Function name: " + name 
                                           + "\nPossible cause: Keyboard() was created with Callback() outside the main script");
            //if ((this as any).shouldThrow(err)) throw err;
            console.error(err)
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

        return this.callbacks[name](ctx, ...fixedArgs);
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
                
                return await this.call(method, body);
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
                return await this.call(method, form);
            }
        }
        else {
            const body: any = { chat_id: chatId, text };

            if (options) this.includeOptions(body, options);

            if (this.parseMode) body.parse_mode = this.parseMode;

            const parsed = await this.call("sendMessage", body);

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

                if (parsed.ok === false) {
                    console.error(parsed.description.slice(13));
                    if (parsed.description.slice(13) === 'inline keyboard expected') {
                        
                    }
                }

                return parsed;
            }
        }
        else if ("text" in options && options.text) {
            const body: any = { chat_id: chatId, message_id: messageId, text: options.text }

            this.includeOptions(body, options); // keyboard, image, etc
            if (this.parseMode) body.parse_mode = this.parseMode;

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
            if (this.parseMode) body.parse_mode = this.parseMode;

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
        let response;
        if (data instanceof FormData) {
            response = await fetch(`${(this as any).apiUrl}/${method}`, {
                method: "POST",
                body: data,
            });
        } else {
            response = await fetch(`${(this as any).apiUrl}/${method}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
        }
        return response.json();
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
        const chat_id = ctx.message?.chat?.id || ctx.chat.id;
        const stringPassed = typeof argument === 'string';
        if (stringPassed) return this.sendMessage(chat_id, argument, options || {});
        else if (!stringPassed && argument?.text) return this.sendMessage(chat_id, argument.text, argument);
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
    protected getKeyboardMarkup(keyboard: KeyboardInterface) {
        if (keyboard._inline) {
            return { ...keyboard.Build() }
        }
        else {
            return { ...keyboard.Build(), resize_keyboard: true } // TODO add option
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

// Updates that can be received
const updateHandlers = new Set([
    "message", "edited_message", "channel_post", "edited_channel_post",
    "business_connection", "business_message", "edited_business_message",
    "deleted_business_messages", "message_reaction", "message_reaction_count",
    "inline_query", "chosen_inline_result", "callback_query", "shipping_query",
    "pre_checkout_query", "purchased_paid_media", "poll", "poll_answer",
    "my_chat_member", "chat_member", "chat_join_request", "chat_boost",
    "removed_chat_boost"
])

// Handlers to specific keys in message update
const messageHandlers = new Set([
    'quote', 'reply_to_story', 'reply_to_checklist_task_id', 'text',
    'animation', 'audio', 'document', 'paid_media', 'photo', 'sticker',
    'story', 'video', 'video_note', 'voice', 'caption', 'checklist',
    'contact', 'dice', 'game', /*'poll',*/ 'venue', 'location',
    'new_chat_members', 'left_chat_member', 'new_chat_title', 'new_chat_photo',
    'delete_chat_photo', 'group_chat_created', 'supergroup_chat_created',
    'channel_chat_created', 'message_auto_delete_timer_changed', 'migrate_to_chat_id',
    'migrate_from_chat_id', 'pinned_message', 'invoice', 'successful_payment',
    'refunded_payment', 'users_shared', 'chat_shared', 'gift', 'unique_gift',
    'connected_website', 'write_access_allowed', 'passport_data',
    'proximity_alert_triggered', 'boost_added', 'chat_background_set',
    'checklist_tasks_done', 'checklist_tasks_added', 'direct_message_price_changed',
    'forum_topic_created', 'forum_topic_edited', 'forum_topic_closed', 'forum_topic_reopened',
    'general_forum_topic_hidden', 'general_forum_topic_unhidden', 'giveaway_created',
    'giveaway', 'giveaway_winners', 'giveaway_completed', 'paid_message_price_changed',
    'suggested_post_approved', 'suggested_post_approval_failed', 'suggested_post_declined',
    'suggested_post_paid', 'suggested_post_refunded', 'video_chat_scheduled',
    'video_chat_started', 'video_chat_ended', 'video_chat_participants_invited', 'web_app_data'
])

const allowedHandlers = new Set([ ...updateHandlers/*, ...messageHandlers*/ ])

interface Handler {
    update: string | undefined;
    key?: string; // key to be checked
    value?: any; // key value to be compared
    func: Function;
    always?: boolean;
}

class HandlerManager {
    handlers: Handler[] = [];
    addedHandlers: Set<string | undefined> = new Set();
    
    /*
     * MAY BE UNSAFE!
     * Adds handler differently
     * 1) If match is an update name, then handler will subscribe only for this update
     * 2) You can specify required key near the update name, e.g "edited-message:poll" will handle only edits with polls
     * 3) You can just specify message key name, for example "video", but be aware! Polls won't work (use "message:poll")
     * 3) If no [allowed in current version of library] update name found, then match will be used as text RegExp
     * @param {string} match Required update name, or update name with required key, or text to be found
     * @param {Function} func
     */
    on(match: string | RegExp, func: Function) {
        if (typeof match !== 'string') {
            this.addHandler('message', func, 'text', match);
        }
        else {
            const _match = match.replace(/-/g,'_');
            if (_match === 'callback') this.addHandler('callback_query', func);
            else if (allowedHandlers.has(_match)) this.addHandler(_match, func);
            else if (_match.includes(':') && allowedHandlers.has(_match.slice(0, _match.indexOf(':')))) {
                const [ updateName, requiredKey ] = _match.split(':');
                this.addHandler(updateName, func, requiredKey); // message-text, message-poll
            }
            else if (messageHandlers.has(_match)) this.addHandler('message', func, _match.replace(/-/g,'_')); // video, new_chat_members
            else this.addHandler('message', func, 'text', getSafeRE(match, false)); // /start, anytext
        }
    }
    
    /*
     * SAFE!
     * Adds update handler (optional to specify required key with ':key')
     * Can be like: "message", "message:text", "message:poll", "chat-boost", "poll-answer:user"
     */
    onUpdate(update: string, func: Function) {
        const _update = update.replace(/-/g,'_');
        if (_update.includes(':')) {
            const [ updateName, requiredKey ] = _update.split(':')
            this.addHandler(cutCbName(_update), func, requiredKey.replace(/-/g,'_'))
        }
        else this.addHandler(cutCbName(_update), func)
    }
    
    text(text: string | RegExp, func: Function) {
        if (typeof text !== 'string') 
            this.addHandler('message', func, 'text', text);
        else 
            this.addHandler('message', func, 'text', getSafeRE(text));
        this.addedHandlers.add('message')
    }
    
    /*
     * Just middleware. No checks applied
     */
    use(func: Function) {
        this.handlers.push({
            update: undefined,
            func
        })
        this.addedHandlers.add(undefined)
    }
    
    /*
     * This middleware will bypass context state
     */
    useAlways(func: Function) {
        this.handlers.push({
            update: undefined,
            func,
            always: true
        })
        this.addedHandlers.add(undefined)
    }
    
    protected addHandler(update: string, func: Function, key?: string, value?: any) {
        this.handlers.push({
            update,
            ...(key ? { key } : {}),
            ...(value ? { value } : {}),
            func
        })
        this.addedHandlers.add(update)
    }
    
    protected async handle(context: Context, name: string) {
        if (!this.addedHandlers.has(name)) return false;
        for (const handler of this.handlers) {
            if (handler.update !== name) continue;
            if (handler.update) {
                if (handler.key === "text" && !handler.value.test(context.text)) continue;
                else if (handler.key !== undefined) {
                    if (handler.value !== undefined && context.update[handler.key] !== handler.value) continue;
                    else if (context.update[handler.value] === undefined) continue;
                }
            }
            if (!!await handler.func(context)) return true;
        }
        return false;
    }
    
    /*
     * Returns all registered middlewares/handlers in their execution order
     * Nameless functions shown as '$'
     */
    print() {
        return this.handlers.map((h: Handler) => ({
            update: h.update || 'any',
            ...(h.key && (()=>{let o:any={};o[h.key]=h.value||'any';return o})()),
            function: h.func.name === "" ? "$" : h.func.name,
        }));
    }
}

function tinySig(text: string, signLength: number): string {
    const hash = createHash("sha256").update(text, "utf8").digest();
    return hash.toString("base64").substring(0, signLength);
}

function cutCbName(update: string) {
    return update === 'callback' ? 'callback_query' : update;
}

function getSafeRE(str: string, ends: boolean = true) {
    return new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${ends ? '$' : ''}`);
}

class Polling extends CallbackManager {
    started = false;
    handlers: Handler[] = [];
    scriptOnUpdate: (msg: any) => void = () => {};
    addedHandlers: Set<string | undefined> = new Set();
    signLength = 5;
    
    async startPolling(onUpdate: (msg: any) => void) { // eslint-disable-line no-unused-vars
        this.started = true;
        this.scriptOnUpdate = onUpdate;
        let offset = 0;
        while (true) {
            const res = await fetch(`${(this as any).apiUrl}/getUpdates?offset=${offset}&timeout=30`);
            const data = await res.json();
            if (!data.result?.length) continue;

            for (const update of data.result) {
                const context = (this as any).Context(update);
                if (context) this.processUpdate(context, update);
                else console.error("Unsupported context", context)
                offset = update.update_id + 1;
            }
        }
    }
    
    protected async processUpdate(context: Context, update: any) {
        handleMiddleware: {
            const state = (this as any).statesEnabled && await context._loadState();
            const allow = state && getAllow(state);
            
            console.log(allow)
            
            for (const handler of this.handlers) {
                if (handler.update) {
                    if (!update[handler.update]) continue;
                    else if (handler.key !== undefined) {
                        if (handler.value !== undefined) {
                            if (handler.key === "text") {
                                if (!handler.value.test(context.text)) continue;
                            }
                            else if (context.update[handler.key] !== handler.value) continue;
                        }
                        else if (context.update[handler.value] === undefined) continue;
                    }
                }
                
                if (allow && !handler.always &&
                   !allow[handler.func.name] && 
                  !(this as any).useAlwaysList.has(handler.func.name)) continue;
                
                const middlewareRes = await this.chainResponse(await handler.func(context), context);
                
                if (!!middlewareRes) {
                    break; // if handler returns anything - stop
                }
            }
            if (update.callback_query) {
                const { data } = context.update;
                
                if (data !== ' ') {
                    const args = data.split(' ');
                    if ((this as any).signCallbacks === true) {
                        //if ((this as any).callbacks[args[1]]) { // check if function name registered
                            if ((this as any).sig(data.slice(this.signLength + 1)) !== data.slice(0, this.signLength)) {
                                console.warn("Wrong signature");
                            }
                            else {
                                if (!allow || allow[args[1]]) {
                                    await this.chainResponse(
                                        await this.handleCallback(context, args[1], args.slice(2)),
                                        context
                                    );
                                }
                            }
                       //}
                    } else {
                      /* todo check too */
                        if (!allow || allow[args[0]])
                            await this.chainResponse(
                                await this.handleCallback(context, args[0], args.slice(1)),
                                context
                            );
                    }
                }
                
                const answer = {
                    callback_query_id: context.update.id,
                    ...(context.update._answer && { ...context.update._answer })
                }
                await (this as any).call('answerCallbackQuery', answer);
            }
            else if (state && state.input) {
                await this.handleCallback(context, state.input);
            }
        }
        
        if(this.scriptOnUpdate !== undefined) await this.scriptOnUpdate(update);
    }
    
    private async chainResponse(result: any, context: Context): Promise<any> {
        if (typeof result === 'function') 
            return await this.chainResponse(await result(context), context);
        else if (typeof result === 'string') {
            if (this.callbacks[result]) 
                return await this.chainResponse(await this.callbacks[result](context), context);
        }
        return false;
    }
    
    private Context(update: any): Context | null {
        const [ctx, eventName]: any = extract(update);
        if (!ctx) return null;

        const isCallbackQuery = !!update.callback_query;

        return new Context(ctx, eventName, this, isCallbackQuery);
    }
}

function extract(update: any): any {
    return [ Object.values(update)[1], Object.keys(update)[1] ];
}

/* when state allow is on */
// TODO caching
function getAllow(state: any): Record<string, boolean> | undefined {
    if (typeof state !== 'object' || !state || !state.allow) return undefined
    
    let allow = state.allow
    if (typeof allow === 'string') allow = [ allow ]
    
    const result: Record<string, boolean> = {}
    
    if (!allow.length || allow.length === 1 && allow[0] === "") return result
    
    allow.forEach((a: string) => result[a] = true)
    
    return result;
}

class ShortcutManager {
    async bot() {
        const { ok, result } = await (this as any).call('getMe', {})
        return ok ? result : {}
    }
    
    async isAdmin(chat: any, from: any) {
        if (!from) {
            console.warn('[Context] Can\'t check admin privileges');
            return;
        }
        
        if (chat?.id >= 0) return false;
        
        const body = { chat_id: chat.id, user_id: from.id }
        const { ok, result } = await (this as any).call("getChatMember", body)
        
        if (ok === false) return false;
        
        return result.status === 'administrator' || result.status === 'creator';
    }
}

class Context {
    public readonly event: string;
    private readonly _update: any;
    private readonly _service: any;
    private readonly _isCallbackQuery: boolean;

    private _state: Record<string, any> | undefined  = undefined;

    constructor(ctx: any, eventName: string, service: any, isCallbackQuery: boolean) {
        this.event = eventName;
        this._update = ctx;
        this._service = service;
        this._isCallbackQuery = isCallbackQuery;
    }

    get state(): Record<string, any> {
        return this._state || {};
        //return this._service.states.cache[this._update.from.id]; // may be unloaded!
    }

    /*
     * UNSAFE!
     * Sets state without checking result
     */
    set state(new_state: Record<string, any>) {
        this._state = new_state;
        this._service.states.set(this._update, new_state);
    }

    /*
     * If you need to check database response use this
     */ 
    async setState(new_state: Record<string, any>) {
        this._state = new_state;
        return this._service.states.set(this._update, new_state);
    }
    
    async _loadState() {
        this._state = await this._service.states.get(this);
        return this._state;
    }

    get update(): any {
        return this._update;
    }

    get service(): any {
        return this._service;
    }

    get text(): string | undefined {
        return this._update.text || this._update.caption;
    }

    getMedia(type: string) {
        return this._update.message?.[type] || this._update[type];
    }

    /*
     * Returns type of message (text, photo, video, callback_query, etc)
     */
    get type(): string | undefined {
        const msg = this._update.message || this._update;

        if (!msg) return undefined;

        if (msg.text) return "text";
        if (msg.photo) return "photo";
        if (msg.video) return "video";
        if (msg.document) return "document";
        if (msg.audio) return "audio";
        if (msg.voice) return "voice";
        if (msg.sticker) return "sticker";
        if (msg.animation) return "animation";
        if (msg.video_note) return "video_note";
        if (msg.contact) return "contact";
        if (msg.location) return "location";
        if (msg.venue) return "venue";
        if (msg.poll) return "poll";
        if (msg.dice) return "dice";

        //if (this._isCallbackQuery && msg.data) return "callback";

        return "unknown";
    }
    
    get isCallback(): boolean {
        return this._isCallbackQuery;
    }

    get chat(): { id: number; [key: string]: any } | undefined {
        return this._update.chat || this._update.message?.chat;
    }

    get from(): { id: number; [key: string]: any } | undefined {
        return this._update.from;
    }

    get message_id(): number | undefined {
        return this._update.message_id || this._update.message?.message_id;
    }

    get data(): string | undefined {
        if (this._isCallbackQuery) {
            return this._update.data;
        }
        if (this.text && this.text.startsWith('/start')) {
            return this.text.slice(7);
        }
        return undefined;
    }

    reply(argument: string | MessageOpts, options?: MessageOpts) {
        return this._service.identifyReply(this._update, argument, options);
    }

    edit(argument1: string | MessageOpts | KeyboardInterface, argument2?: MessageOpts | KeyboardInterface) {
        if (!this._isCallbackQuery) {
            console.warn('[Context] .edit() can be used in callbacks only');
            return;
        }
        return this._service.identifyEdit(this._update, argument1, argument2);
    }

    respond(argument1: string | MessageOpts | KeyboardInterface, argument2?: MessageOpts | KeyboardInterface) {
        if (!this._isCallbackQuery) {
            return this._service.identifyReply(this._update, argument1, argument2)
        }
        else return this._service.identifyEdit(this._update, argument1, argument2);
    }

    answer(text: string, options: any = {}) {
        if (!this._isCallbackQuery) {
            console.warn('[Context] .query() can be used in callbacks only');
            return;
        }
        const answer: any = { text };
        if (options.alert) answer.show_alert = true;
        if (options.url) answer.url = options.url;
        this.update._answer = { text, ...options };
    }

    react(emoji: string, big?: boolean) {
        if (this._isCallbackQuery) {
            console.warn('[Context] .react() can\'t be used for callback_query');
            return;
        }

        const chatId = this.chat?.id;
        const messageId = this.message_id;

        if (!chatId || !messageId) {
             console.warn('[Context] .react() couldn\'t find chat.id or message_id');
             return;
        }

        return this._service.react(chatId, messageId, emoji, big);
    }
    
    async delete() {
        if (!this._isCallbackQuery) {
            console.warn('[Context] .delete() can be used in callbacks only');
            return;
        }
        
        const chat_id = this.chat?.id;
        const message_id = this.message_id;
        if (!chat_id || !message_id) return;
        
        return this._service.call('deleteMessage', { message_id, chat_id })
    }
    
    async call(method: string, params?: Record<string, any>) {
        const chat_id = this.chat?.id;
        
        const body = {
            ...(chat_id && { chat_id }),
            ...params
        }
        
        return this._service.call(method, body);
    }

    async isAdmin(): Promise<boolean> {
        return this.service.isAdmin(this.chat, this.from);
    }

    get isGroup(): boolean {
        return (this._update.message || this._update).chat.id < 0;
    }

    async input(func: string | Function, allowed?: string | string[]) {
        if (!func) throw new Error("No function specified after input is done!")
        else if (!(this as any)._service.hasCallback(func)) throw new Error("Function must be registered! " + func)
        return this.setState({
            ...this.state,
            ...(allowed && { allow: typeof allowed === 'string' ? [allowed] : allowed }),
            input: typeof func === 'function' ? func.name : func
        })
    }

    async reset() {
        return await this.setState({})
    }
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
        ShortcutManager,
        StateManagerMixin,
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
    ShortcutManager,
    StateManagerMixin,
    Polling,
]);


export class TelegramBot extends TelegramBotBase {
    callbacks: Record<string, Function> = {};
    handlers: Handler[] = [];
    addedHandlers: Set<string | undefined> = new Set();
    useAlwaysList: Set<string> = new Set();
    allow_override = false;
    mode = 0;
    parseMode: string | null = null;
    exception: (new (...args: any[]) => Error)[] = [];
    signCallbacks = true;
    signLength = 4;
    started = false;
    states = new StateManager();
    cacheRemoverInterval: NodeJS.Timeout | null = null;
    statesEnabled = true;

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
        
        if (this.statesEnabled) {
            (this as any)._startStateCacheRemover(1000);
        }
    }
}

