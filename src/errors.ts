/*
 * Ошибка вызывается когда не инициализирован бот
 */
export class NoBotSelected extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NoBotSelected";
    }
}

/*
 * Ошибка когда передана функция без названия не в режиме StoreCallbacks
 */
export class NamelessCallback extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NamelessCallback";
    }
}

/*
 * Ошибка когда передана функция с уже занятым названием
 */
export class CallbackOverride extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CallbackOverride";
    }
}

/*
 * Ошибка параметров бота
 */
export class OptionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OptionsError";
    }
}
