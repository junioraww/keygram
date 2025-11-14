import { MessageOpts, Context, KeyboardClass } from '$'
import { ParserName } from '$/mixins/shortcuts'
import { ParserError, FileNotFound } from '$/errors'
import { readFile } from "node:fs/promises"

export class MessageSender {
    parseMode: ParserName | undefined;

    /*
     * Sending a message
     * @param {number} chatId Chat ID
     * @param {string} text Text to send
     * @param {MessageOpts} [options] Message options
     * @throws {ParserError} Being thrown when there's unclosed tags, etc
     */
    async sendMessage(ctx: Context, chatId: number, text: string, options?: MessageOpts | KeyboardClass) {
        if (options && "file" in options && options.file) {
            const body: any = { chat_id: chatId, caption: text };

            await this.includeOptions(ctx, body, options);

            if (this.parseMode) body.parse_mode = this.parseMode;

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

            if (options) await this.includeOptions(ctx, body, options);

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
    protected async includeOptions(ctx: Context, body: any, options: MessageOpts | KeyboardClass) {
        if ("Build" in options) {
            body.reply_markup = await options.Build(ctx);
        } 
        else if ('keyboard' in options && options.keyboard) {
            if ('Build' in options.keyboard) {
                body.reply_markup = await options.keyboard.Build(ctx);
            }
        }
    }

    /*
     * Message editing
     * @param {number} chatId
     * @param {number} messageId
     * @param {MessageOpts} options
     */
    async editMessage(ctx: Context, chatId: number, messageId: number, options: MessageOpts) {
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

                await this.includeOptions(ctx, body, options);
                
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

                await this.includeOptions(ctx, body, options);

                if (options.spoiler === true) body.media.has_spoiler = true;
                if (this.parseMode) body.media.parse_mode = this.parseMode;

                const res = await fetch(`${(this as any).apiUrl}/editMessageMedia`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });

                const parsed = await res.json();

                /*if (parsed.ok === false) {
                    console.error(parsed.description.slice(13));
                    if (parsed.description.slice(13) === 'inline keyboard expected') {
                        console.error("...")
                    }
                }*/

                return parsed;
            }
        }
        else if ("text" in options && options.text || (!options.text && !options.caption)) {
            const body: any = { chat_id: chatId, message_id: messageId }

            let method!: string;
            
            if (options.text) {
                method = "editMessageText";
                body.text = options.text;
            } else {
                method = "editMessageReplyMarkup";
            }

            await this.includeOptions(ctx, body, options); // keyboard, image, etc
            if (this.parseMode) body.parse_mode = this.parseMode;

            const res = await fetch(`${(this as any).apiUrl}/${method}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const parsed = await res.json();

            return parsed;
        }
        else if ("caption" in options && options.caption) {
            const body: any = { chat_id: chatId, message_id: messageId, caption: options.text }

            await this.includeOptions(ctx, body, options);
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
    async identifyEdit(ctx: Context, argument1: string | MessageOpts | KeyboardClass,
                       argument2?: MessageOpts | KeyboardClass) {
        const chat_id = ctx.update.message?.chat?.id;
        if (!chat_id) throw new Error("Can't edit outside callback context")

        if (typeof argument1 === 'string') {
            const body: any = "Build" in (argument2 || {}) ? { keyboard: argument2 } : argument2 || {};

            if (!ctx.update.message.text) {
                return this.editMessage(ctx, chat_id, ctx.update.message.message_id, {
                    ...body,
                    caption: argument1
                })
            }
            else {
                return this.editMessage(ctx, chat_id, ctx.update.message.message_id, {
                    ...body,
                    text: argument1
                })
            }
        }
        else {
            const body: any = "Build" in argument1 ? { keyboard: argument1 } : argument1;

            if (!ctx.update.message.text) {
                return this.editMessage(ctx, chat_id, ctx.update.message.message_id, {
                    ...body,
                    caption: body.text || body.caption // TODO separate interface for message opts - to exclude caption
                })
            }
            else {
                return this.editMessage(ctx, chat_id, ctx.update.message.message_id, {
                    ...body,
                    text: body.text || body.caption
                })
            }
        }
    }

    async identifyReply(ctx: Context, argument_1: string | MessageOpts | KeyboardClass, argument_2: undefined | MessageOpts | KeyboardClass) {
        const chat_id = ctx.update.message?.chat?.id || ctx.update.chat.id;
        const firstArgumentString = typeof argument_1 === 'string';
        if (firstArgumentString) return this.sendMessage(ctx, chat_id, argument_1, argument_2 || {});
        else if (!firstArgumentString) {
            if ("text" in argument_1 && argument_1.text) return this.sendMessage(ctx, chat_id, argument_1.text, argument_2 || argument_1)
            else return this.sendMessage(ctx, chat_id, " ", argument_2 || argument_1);
        }
    }
}
