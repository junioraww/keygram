import { CallbackManager } from '$/mixins/callbacks'
import { Handler } from '$/mixins/handlers'
import { Context } from '$/context'

export class Polling extends CallbackManager {
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
        handleMiddlewares: {
            if (context.from && (this as any).limitManager) {
                const limited = await (this as any).limitManager.handle(context)
                if (limited) {
                    if (context.update._answer) {
                        const answer = {
                            callback_query_id: context.update.id, ...context.update._answer
                        }
                        await (this as any).call('answerCallbackQuery', answer);
                    }
                    break handleMiddlewares;
                }
            }

            const state = (this as any).statesEnabled && await context._loadState();
            const allow = state && getAllow(state);

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
        return result;
    }

    private Context(update: any): Context | null {
        const [ctx, eventName]: any = extract(update);
        if (!ctx) return null;

        return new Context(ctx, eventName, this)
    }
}

// wtfsthis
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
