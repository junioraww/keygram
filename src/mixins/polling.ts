import http, { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import { CallbackManager } from '$/mixins/callbacks'
import { Handler, updateHandlers } from '$/mixins/handlers'
import { Context } from '$/context'

export class Polling extends CallbackManager {
    started = false;
    handlers: Handler[] = [];
    scriptOnUpdate!: () => void;
    addedHandlers = new Set<string | undefined>();
    alwaysUseSet = new Set<Function>();
    signLength = 5;

    async startPolling(params?: Record<string, any>, onUpdate?: () => void) {
        this.started = true;
        if(onUpdate) this.scriptOnUpdate = onUpdate;

        const allowed_updates = params?.receiveAll ? updateHandlers : params?.allowed_updates;
        const allowed_updates_query = allowed_updates ? ("&allowed_updates=" + encodeURIComponent(allowed_updates.toString())) : "";
        const query = allowed_updates_query + "&timeout=30";

        let offset = 0;
        while (true) {
            try {
                while (true) {
                    const res = await fetch(`${(this as any).apiUrl}/getUpdates?offset=${offset}` + query);
                    const data = await res.json();
                    if (!data.result?.length) continue;

                    for (const update of data.result) {
                        const context = (this as any).Context(update);
                        if (context) this.processUpdate(context, update);
                        else console.error("Unsupported context", context)
                        offset = update.update_id + 1;
                    }
                }
            } catch (e) {
                console.error(e)
                offset++;
            }
        }
    }
    /*
     * Starts webhook
     */
    async start(argument: Record<string, any> | string, onStart?: ()=>void, onUpdate?: ()=>void) {
        const webhookBody: Record<string, any> = {};
        let port = 3000;
        let isSecure = false;
        let secretToken: string | undefined;
        let httpsOptions: https.ServerOptions = {};

        if (typeof argument === 'object' && argument !== null) {
            port = Number(argument.port) || 3000;
            isSecure = !!argument.secure;
            secretToken = argument.secret_token;

            for (const key in argument) {
                if (['port', 'secure', 'key', 'cert', 'ca'].includes(key)) continue;
                webhookBody[key] = argument[key];
            }

            /*if (argument.port) {
                webhookBody.port = argument.port;
            }*/

            if (isSecure) {
                if (!argument.key || !argument.cert) {
                    console.warn("HTTPS requires 'key' and 'cert' options. Trying to start without them might fail.");
                }
                httpsOptions = {
                    key: argument.key,   // (e.g., fs.readFileSync('./privkey.pem'))
                    cert: argument.cert, // (e.g., fs.readFileSync('./fullchain.pem'))
                    ca: argument.ca
                };
            }
        } else {
            webhookBody.url = argument;
            if (argument.startsWith('https:')) {
                isSecure = true;
            }
        }
        if (!webhookBody.url) {
            throw new Error("Webhook URL is required. Please, specify it in arguments or use bot.startPolling()");
        }
        if (onUpdate) {
            this.scriptOnUpdate = onUpdate;
        }
        const requestListener = async (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== "POST") {
                res.writeHead(200).end();
                return;
            }

            if (secretToken) {
                if (req.headers['x-telegram-bot-api-secret-token'] !== secretToken) {
                    console.warn("Received update with invalid secret token.");
                    res.writeHead(404).end();
                    return;
                }
            }

            let body = "";
            try {
                req.setEncoding('utf8');
                for await (const chunk of req) {
                    body += chunk;
                }

                const update = JSON.parse(body);

                res.writeHead(200).end();

                try {
                    const context = (this as any).Context(update);
                    if (context) {
                        this.processUpdate(context, update);
                    } else {
                        console.error("Unsupported update context", update);
                    }
                } catch (e) {
                    console.error("Error processing update:", e);
                }

            } catch (error) {
                console.error("Error handling webhook request (e.g., JSON.parse):", error);
                if (!res.writableEnded) {
                    res.writeHead(500).end();
                }
            }
        };

        let server: http.Server | https.Server;

        if (isSecure) {
            if (!httpsOptions.key || !httpsOptions.cert) {
                throw new Error("Cannot start HTTPS server: 'key' and 'cert' are missing from options.");
            }
            server = https.createServer(httpsOptions, requestListener);
        } else {
            server = http.createServer(requestListener);
        }

        server.listen(port, onStart);

        try {
            const existing = await (this as any).call('getWebhookInfo');
            console.log('getWebhookInfo', existing)
            if (existing.result.url !== "") {
                const setResult = await (this as any).call('setWebhook', webhookBody);
                console.log('setWebhook', setResult)
            }
        } catch (error) {
            console.error("Error during setWebhook call:", error);
        }

        // TODO graceful stop with deleteWebhook
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
                            else if (update[handler.key] !== handler.value) continue;
                        }
                        else if (update[handler.update][handler.key] === undefined) continue;
                    }
                }

                if (allow &&
                   !allow[handler.func.name] &&
                   !this.alwaysUseSet.has(handler.func)) continue;

                const middlewareRes = await this.chainResponse(await handler.func(context), context);

                if (middlewareRes) {
                    break; // if handler returns anything - stop
                }
            }
            if (update.callback_query) {
                const { data } = context.update;

                if (data !== ' ') {
                    const args = data.split(' ');
                    if ((this as any).signCallbacks === true) {
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
            else if (update.inline_query) {
                const { id, _answer, cache, personal, offset } = context.update;

                if (_answer) {
                    const answer = {
                        inline_query_id: id,
                        results: _answer,
                        cache_time: cache || 1,
                        is_personal: personal || true,
                        next_offset: offset || "",
                    }
                    await (this as any).call('answerInlineQuery', answer);
                }
            }
            else if (state && state.input) {
                await this.handleCallback(context, state.input);
            }
        }
        if(this.scriptOnUpdate !== undefined) await (this as any).scriptOnUpdate(update);
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
