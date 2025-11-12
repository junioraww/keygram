import { TelegramBot, KeyboardClass, MessageOpts, PaginationClass } from '$'

export class Context {
    public readonly event: string;
    private readonly _update: any;
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
     * Sets state without checking result
     */
    set state(new_state: Record<string, any>) {
        this._state = new_state;
        this.service.states.set(this._update, new_state);
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

        return "unknown";
    }
    
    get isCallback(): boolean {
        return this.event === "callback_query";
    }

    get chat(): { id: number; [key: string]: any } | undefined {
        return this.update.chat || this._update.message?.chat;
    }

    get from(): { id: number; [key: string]: any } | undefined {
        return this._update.from;
    }

    get message_id(): number | undefined {
        return this.update.message_id || this.update.message?.message_id;
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
        return this.service.identifyReply(this.update, argument_1, argument_2);
    }

    edit(argument1: string | MessageOpts | KeyboardClass, argument2?: MessageOpts | KeyboardClass) {
        if (!this.isCallback) {
            console.warn('[Context] .edit() can be used in callbacks only');
            return;
        }
        return this.service.identifyEdit(this.update, argument1, argument2);
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
        const messageId = this.message_id;

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
        const message_id = this.message_id;
        if (!chat_id || !message_id) return;
        
        return this.service.call('deleteMessage', { message_id, chat_id })
    }
    
    async call(method: string, params?: Record<string, any>) {
        const chat_id = this.chat?.id;
        
        const body = {
            ...(chat_id && { chat_id }),
            ...params
        }
        
        return this.service.call(method, body);
    }

    isAdmin(): Promise<boolean> {
        return this.service.isAdmin(this.chat, this.from);
    }

    get isGroup(): boolean {
        return (this._update.message || this._update).chat.id < 0;
    }

    async input(func: string | Function, allowed?: string | string[]) {
        if (!func) throw new Error("No function specified after input is done!")
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

    async open(clss: PaginationClass | null, page: number = 0, ...args: any[]) {
        if (clss instanceof PaginationClass) return await clss.open(this, page, ...args)
        else return null
    }
}
