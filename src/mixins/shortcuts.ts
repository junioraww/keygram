import { MessageOpts, KeyboardClass, Context } from '$'
import { MessageSender } from '$/mixins/messages'

export type ParserName = 'HTML' | 'MarkdownV2' | 'Markdown' | undefined;

export class LimitManager {
    storeInterval: NodeJS.Timeout | null = null;
    store: Record<number, number> = {};
    ms = 0;
    func: Function | undefined;

    constructor(ms: number, func: Function | undefined) {
        this.ms = ms;
        this.func = func;
        this.startInterval();
    }

    async handle(ctx: Context) {
        if (!ctx.from || !this.ms) return false;
        const currentTimeout = this.store[ctx.from.id] || 0;
        this.store[ctx.from.id] = Date.now() + this.ms;
        if (currentTimeout > Date.now() && (!this.func || await this.func(ctx)))
            return true;
        return false;
    }

    startInterval(): void {
        if (this.storeInterval) this.stopInterval();

        this.storeInterval = setInterval(() => {
            const store = this.store;
            const now = Date.now();
            for (const userId in store) {
                if (Object.prototype.hasOwnProperty.call(store, userId)) {
                    if (store[userId] < now) {
                        delete store[Number(userId)];
                    }
                }
            }
        }, 10000);
    }

    stopInterval(): void {
        if (this.storeInterval) {
            clearInterval(this.storeInterval);
            this.storeInterval = null;
        }
    }
}

export class ShortcutManager extends MessageSender {
    limitManager: LimitManager | undefined;

    async me() {
        const { ok, result } = await (this as any).call('getMe', {})
        return ok ? result : {}
    }

    /*
     * Checks if user is admin (in groups)
     * @param {any} argument_1 Chat id, object or context object
     * @param {any} [argument_2] User id, object
     */
    async isAdmin(argument_1: any, argument_2?: any): Promise<boolean> {
        let chat_id: number | undefined;
        let user_id: number | undefined;

        if (!argument_2) {
            chat_id = argument_1?.chat?.id;
            user_id = argument_1?.from?.id;
        }
        else {
            if (typeof argument_1 === 'object') chat_id = argument_1?.id;
            else chat_id = Number(argument_1);
            if (typeof argument_2 === 'object') user_id = argument_2?.id;
            else user_id = Number(argument_2);
        }

        if (user_id && user_id < 0) {
            const intermed = user_id;
            user_id = chat_id;
            chat_id = intermed;
        }

        if (!chat_id || !user_id) {
            console.warn('[Context] Couldn\'t extract chat_id or user_id from arguments');
            return false;
        }

        if (chat_id >= 0) {
            console.warn('[Context] Can\'t check admin privileges in DMs');
            return false;
        }

        const body = { chat_id, user_id }
        const { ok, result } = await (this as any).call("getChatMember", body)

        if (ok === false) return false;

        return result.status === 'administrator' || result.status === 'creator';
    }

    respond(ctx: Context, argument_1: string | MessageOpts | KeyboardClass, argument_2?: MessageOpts | KeyboardClass) {
        if (!ctx.isCallback) {
            return ctx.service.identifyReply(ctx, argument_1, argument_2)
        }
        else return ctx.service.identifyEdit(ctx, argument_1, argument_2);
    }

    /*
     * Sets message parser
     * @param {ParserName} name Parser name (HTML, MarkdownV2, Markdown or null)
     */ 
    setParser(name: ParserName) {
        (this as any).parseMode = name;
    }

    /*
     * Limits messages
     * @param {Function | string} stop Function to execute when user spams
     */
    limit(seconds: number, handler?: Function | undefined) {
        if (this.limitManager) {
            this.limitManager.ms = seconds * 1000;
            this.limitManager.func = handler;
        }
        else this.limitManager = new LimitManager(seconds * 1000, handler);
    }
}

