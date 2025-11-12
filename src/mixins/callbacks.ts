import { NamelessCallback, CallbackNotFound, CallbackOverride } from '$/errors'
import { createHash } from 'node:crypto'

export class CallbackManager {
    callbacks!: Record<string, Function>;
    allow_override = false;
    mode = 0;
    started = false;
    signCallbacks!: boolean;
    signLength!: number;
    token!: string;

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
    
    getCallbackData(data: string) {
        if (this!.signCallbacks) return tinySig(data + this.token, this!.signLength) + ' ' + data;
        return data;
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

export class CallbackSigner {
    signCallbacks!: boolean;
    signLength!: number;
    token!: string;

    sig(data: string) {
        return tinySig(data + this.token, this.signLength);
    }

    requireSig() {
        return this.signCallbacks;
    }
}

function tinySig(text: string, signLength: number): string {
    const hash = createHash("sha256").update(text, "utf8").digest();
    return hash.toString("base64").substring(0, signLength);
}

function cutCbName(update: string) {
    return update === 'callback' ? 'callback_query' : update;
}
