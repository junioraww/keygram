import { Context } from '$'

// Updates that can be received
export const updateHandlers = new Set([
    "message", "edited_message", "channel_post", "edited_channel_post",
    "business_connection", "business_message", "edited_business_message",
    "deleted_business_messages", "message_reaction", "message_reaction_count",
    "inline_query", "chosen_inline_result", "callback_query", "shipping_query",
    "pre_checkout_query", "purchased_paid_media", "poll", "poll_answer",
    "my_chat_member", "chat_member", "chat_join_request", "chat_boost",
    "removed_chat_boost"
])

// Handlers to specific keys in message update
export const messageHandlers = new Set([
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

export interface Handler {
    update: string | undefined;
    key?: string; // key to be checked
    value?: any; // key value to be compared
    func: Function;
    always?: boolean;
}

export class HandlerManager {
    handlers: Handler[] = [];
    addedHandlers: Set<string | undefined> = new Set();

    /*
     * [UNSAFE] 
     * Adds handler (acts differently)
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
            else if (updateHandlers.has(_match)) this.addHandler(_match, func);
            else if (_match.includes(':') && updateHandlers.has(_match.slice(0, _match.indexOf(':')))) {
                const [ updateName, requiredKey ] = _match.split(':');
                this.addHandler(updateName, func, requiredKey); // message:text, message:poll
            }
            else if (messageHandlers.has(_match)) this.addHandler('message', func, _match.replace(/-/g,'_')); // video, new_chat_members
            else this.addHandler('message', func, 'text', getSafeRE(match, false)); // /start, anytext
        }
    }

    /*
     * [SAFE]
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

function getSafeRE(str: string, ends: boolean = true) {
    return new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${ends ? '$' : ''}`);
}

function cutCbName(update: string) {
    return update === 'callback' ? 'callback_query' : update;
}
