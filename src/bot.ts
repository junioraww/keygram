import { KeyboardClass, Button } from '$'
import { INSTANCES, BOT_IDS } from '$/store'
import { OptionsError } from '$/errors'
import { StateManager, StateManagerMixin } from '$/mixins/states'
import { CallbackManager, CallbackSigner } from '$/mixins/callbacks'
import { ShortcutManager, LimitManager, ParserName } from '$/mixins/shortcuts'
import { HandlerManager, Handler } from '$/mixins/handlers'
import { MessageSender } from '$/mixins/messages'
import { Polling } from '$/mixins/polling'

export interface BotOptions {
    token: string;
    signCallbacks: boolean | undefined;
    signLength: number | undefined;
}

export interface MessageOpts {
    text?: string | undefined;
    caption?: string | undefined;
    keyboard?: Button[][] | KeyboardClass;
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
    id!: number;

    protected initBot(token: string) {
        this.token = token;
        this.apiUrl = `https://api.telegram.org/bot${token}`;
        const botId = parseInt(token.split(':')[0]);
        this.id = botId;
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

class ErrorManager {
    exception: (new () => Error)[] = [];

    /*
     * Disables exception
     * @param {...(new (...args: any[]) => Error)} errors List of exceptions
     */
    dontThrow(...errors: (new () => Error)[]) {
        errors.forEach(e => this.exception.push(e));
    }

    shouldThrow(err: Error) {
        return !this.exception.some(ex => err instanceof ex);
    }
}


class TelegramBotBase {}

interface TelegramBotBase
    extends BotInstance,
        CallbackManager,
        MessageSender,
        ErrorManager,
        HandlerManager,
        CallbackSigner,
        ShortcutManager,
        StateManagerMixin,
        Polling {}

applyMixins(TelegramBotBase, [
    BotInstance,
    CallbackManager,
    MessageSender,
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
    addedHandlers = new Set<string | undefined>();
    alwaysUseSet = new Set<Function>();
    allow_override = false;
    mode = 0;
    exception: (new () => Error)[] = [];
    signCallbacks = true; // TODO plugin
    signLength = 6;
    started = false;
    states = new StateManager(); // TODO plugin
    cacheRemoverInterval: NodeJS.Timeout | undefined;
    statesEnabled: boolean | undefined;
    limitManager: LimitManager | undefined; // TODO plugin
    parseMode: ParserName | undefined; // TODO plugin
    id!: number;

    constructor(options: BotOptions | string) {
        super();

        let token: string;
        
        this.statesEnabled = true;

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

