import { TelegramBot, Context } from '$'
import { NoBotSelected } from '$/errors'
import { INSTANCES, BOT_IDS } from '$/store'
import { KeyboardClass, Button } from '$/utils/keyboard'

/*
 * @param {string} name Panel name
 * @param {number} [botId] Bot id (optional)
 */
export function Pagination(name: string, botId: number | undefined) {
    const bot = INSTANCES[botId || BOT_IDS[0]];
    if (!bot) throw new NoBotSelected("Bot with ID " + (botId || 0) + " not initialized");
    return new PaginationClass(name, bot);
}

const Keyboards: Record<string, PaginationClass> = {};

/*
 * Handling page open
 */
function PgO(ctx: Context, id: string, page: number = 0, ...args: any[]): Promise<any> | undefined {
    if (isNaN(page)) return;

    const entry = Keyboards[id];
    if (!entry) return;

    return entry.open(ctx, page, ...args);
}

/*
 * Normalize current page (sets max if page < 0, sets 0 if page >= max)
 * @param {any[] | number} data All items that can be displayed on page OR all items amount
 * @param 
 */
export function Normalize(items: any[] | number, currentPage: number, itemsPerPage: number) {
    const totalPages = Math.ceil((typeof items === 'number' ? items : items.length) / itemsPerPage);
    if (currentPage < 0) return totalPages;
    else if (currentPage >= totalPages) return 0;
    return currentPage;
}

export class PaginationClass {
    private _service: TelegramBot;
    private id: string;// = btoa(Math.random().toString()).slice(0, 8);
    private getData: Function | undefined;
    private getText: Function | undefined;
    private getKeyboard: Function | undefined;
    private getAfterKeys: Function | undefined;
    private back: string = "<";
    private forth: string = ">";
    private middle: string | undefined;
    private page: number = 0;
    private pageSize: number = 10;

    constructor(name: string, bot: TelegramBot) {
        this._service = bot;
        this.id = name;

        if (!bot.hasCallback(PgO)) {
            bot.register(PgO)
        }

        Keyboards[this.id] = this;
    }

    /*
     * Sets 'getter' of items when keyboard is opened (must be database request)
     * If you slice page by yourself, return [ array_of_items_to_be_displayed, total_items_size ]
     * so the code will correctly set keyboard buttons
     * If you just return an array of all items, code can slice array itself (you may set PageSize)
     */
    Data(func: Function) {
        this.getData = func;
        return this;
    }

    /*
     * Sets text function
     */
    Text(func: Function) {
        this.getText = func;
        return this;
    }

    /*
     * Sets keyboard function
     */
    Keys(func: Function) {
        this.getKeyboard = func;
        return this;
    }
    
    AfterKeys(func: Function) {
        this.getAfterKeys = func;
        return this;
    }

    Back(text: string) {
        this.back = text;
        return this;
    }

    Forth(text: string) {
        this.forth = text;
        return this;
    }

    Middle(text: string) {
        this.middle = text;
        return this;
    }
    
    PageSize(size: number) {
        this.pageSize = size;
        return this;
    }

    get action() {
        return `PgO ${this.id}`;
    }

    async open(ctx: Context, page: number, ...args: any[]) {
        if (!this.getData || !this.getKeyboard) {
            console.warn("Some required keyboard functions was missing");
            return true;
        }

        const response: any[] = await this.getData(ctx, page, ...args);

        let data!: any;
        let totalSize!: number;

        if (typeof response[1] === 'number') {
            data = response[0];
            totalSize = response[1];
        } else if (response) {
            data = response.slice(page * this.pageSize, page * this.pageSize + this.pageSize);
            totalSize = response.length;
        }

        const maxPage = Math.ceil(totalSize / this.pageSize) - 1;
        const previousPage = page === 0 ? maxPage : (page - 1);
        const nextPage = page >= maxPage ? 0 : (page + 1);
        (ctx as any).maxPage = Math.min(1, maxPage + 1);

        const keyboard: Button[][] | KeyboardClass = await this.getKeyboard(ctx, data, page, ...args);
        const afterKeys: Button[][] | KeyboardClass | undefined = this.getAfterKeys ? await this.getAfterKeys(ctx, data, page, ...args) : undefined;

        const btnRow = [
            { text: this.back, callback_data: ctx.bot.getCallbackData(`PgO ${this.id} ${previousPage}${args.length ? (' ' + args.join(' ')) : ''}`) },
            ...(this.middle ? [{ text: this.middle, callback_data: ' ' }] : []),
            { text: this.forth, callback_data: ctx.bot.getCallbackData(`PgO ${this.id} ${nextPage}${args.length ? (' ' + args.join(' ')) : ''}`) },
        ];

        if (Array.isArray(keyboard)) {
            keyboard.push(btnRow);
            if (afterKeys) console.warn("AfterKeys for Button[][] not implemented :P")
        }
        else {
            keyboard.Add(btnRow);
            if (afterKeys) keyboard.Add(afterKeys);
        }

        return await ctx.respond({ keyboard, ...(this.getText && ({ text: await this.getText(ctx, data, page, ...args) }) )});
    }
}
