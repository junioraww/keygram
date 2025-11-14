import { TelegramBot, KeyboardClass, MessageOpts, PaginationClass } from '$'

export class Context {
    public readonly event: string;
    private _update: any;
    private readonly _service: TelegramBot;

    private _state: Record<string, any> | undefined  = undefined;

    constructor(ctx: any, eventName: string, service: any) {
        this.event = eventName;
        this._update = ctx;
        this._service = service;
    }

    get state(): Record<string, any> {
        return this._state || {};
        //return this.service.states.cache[this._update.from.id]; // may be unloaded!
    }

    /*
     * UNSAFE!
     * Sets state without verifying result
     */
    set state(new_state: Record<string, any>) {
        this._state = new_state;
        this.service.states.set(this._update, new_state);
    }

    /*
     * Sets state returning set function (useful in prod to catch db errors)
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

    get service(): TelegramBot {
        return this._service;
    }

    get bot(): TelegramBot {
        return this._service;
    }

    get text(): string | undefined {
        return this._update.text || this._update.caption;
    }

    getMedia(type: string) {
        return this.update.message?.[type] || this.update[type];
    }

    /*
     * Returns type of message (text, photo, video, callback_query, etc)
     */
    get type(): string | undefined {
        const msg = this.update.message || this.update;

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

        return "unknown";
    }
    
    get isCallback(): boolean {
        return this.event === "callback_query";
    }

    get chat(): { id: number; [key: string]: any } | undefined {
        return this.update.chat || this.update.message?.chat;
    }

    get from(): { id: number; [key: string]: any } | undefined {
        return this.update.from;
    }

    /*get message_id(): number | undefined {
        return this.msgId();
    }*/
    
    get msgId(): number | undefined {
        return this.update.message_id || this.update.message?.message_id;
    }

    /*
     * Changes current update context (e.g ctx.message = ctx.reply("Hello world"))
     * @throws {Error} If function passed
     */
    set message(update: Record<string, any>) {
        if (update.ok !== undefined) { // if used like ctx.message = await ...
            if (!update.ok) throw new Error(update.error)
            this._update = update.result;
        }
        else this._update = update;
    }

    get data(): string | undefined {
        if (this.isCallback) {
            return this.update.data;
        }
        if (this.text && this.text.startsWith('/start')) {
            return this.text.slice(7);
        }
        return undefined;
    }

    reply(argument_1: string | MessageOpts, argument_2?: MessageOpts | KeyboardClass) {
        return this.service.identifyReply(this, argument_1, argument_2);
    }

    edit(argument1: string | MessageOpts | KeyboardClass, argument2?: MessageOpts | KeyboardClass) {
        if (!this.isCallback) {
            console.warn('[Context] .edit() can be used in callbacks only');
            return;
        }
        return this.service.identifyEdit(this, argument1, argument2);
    }

    respond(argument1: string | MessageOpts | KeyboardClass, argument2?: MessageOpts | KeyboardClass) {
        return this.service.respond(this, argument1, argument2);
    }

    answer(text: string, options: any = {}) {
        if (!this.isCallback) {
            console.warn('[Context] .query() can be used in callbacks only');
            return true;
        }
        const answer: any = { text };
        if (options.alert) answer.show_alert = true;
        if (options.url) answer.url = options.url;
        this.update._answer = { text, ...options };
        return true;
    }

    react(emoji: string, big?: boolean) {
        if (this.isCallback) {
            console.warn('[Context] .react() can\'t be used for callback_query');
            return;
        }

        const chatId = this.chat?.id;
        const messageId = this.msgId;

        if (!chatId || !messageId) {
             console.warn('[Context] .react() couldn\'t find chat.id or message_id');
             return;
        }

        return this.service.react(chatId, messageId, emoji, big);
    }

    async delete() {
        if (!this.isCallback) {
            console.warn('[Context] .delete() can be used in callbacks only');
            return;
        }

        const chat_id = this.chat?.id;
        const message_id = this.msgId;
        if (!chat_id || !message_id) return;

        return this.service.call('deleteMessage', { message_id, chat_id })
    }

    async call(method: string, params?: Record<string, any>) {
        const chat_id = this.chat?.id;

        const body: Record<string, any> = {
            ...(chat_id && { chat_id })
        }

        if ((this as any).bot.parse_mode !== undefined) {
            if (methodsToIncludeParseMode.has(method)) body.parse_mode = (this as any).bot.parse_mode;
        }

        for (const p in params) body[p] = params[p];

        return this.service.call(method, body);
    }

    isAdmin(): Promise<boolean> {
        return this.service.isAdmin(this.chat, this.from);
    }

    get isGroup(): boolean {
        return (this.update.message || this.update).chat.id < 0;
    }

    async input(func: string | Function, allowed?: string | string[]) {
        if (!func) throw new Error("No function specified to be handled after an input is done!")
        else if (!(this as any).service.hasCallback(func)) throw new Error("Function must be registered! " + func)
        return this.setState({
            ...this.state,
            ...(allowed && { allow: typeof allowed === 'string' ? [allowed] : allowed }),
            input: typeof func === 'function' ? func.name : func
        })
    }

    async reset() {
        return await this.setState({})
    }

    async open(clss: PaginationClass | KeyboardClass, ...args: any[]) {
        if (clss instanceof PaginationClass) return await clss.open(this, args[0] || 0, ...args.slice(1))
        else if (clss instanceof KeyboardClass) return await clss.open(this, args[0])
    }
}

const methodsToIncludeParseMode = new Set([
  "sendMessage", "copyMessage", "sendPhoto", "sendAudio", "sendDocument",
  "sendVideo", "sendAnimation", "sendVoice", "sendVideoNote", "sendPaidMedia", 
  "sendMediaGroup", "postStory", "editStory",
  "editMessageText", "editMessageCaption"
])

// TODO handle methods with different parse_mode names (e.g quote_parse_mode)
