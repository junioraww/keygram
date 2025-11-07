/*
 * Bot not initialized
 */
export class NoBotSelected extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NoBotSelected";
    }
}

/*
 * Passing an unnamed function not in StoreCallbacks mode
 */
export class NamelessCallback extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NamelessCallback";
    }
}

/*
 * Callback is not initialized
 */
export class CallbackNotFound extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CallbackNotFound";
    }
}

/*
 * Passing a function whose name is already taken
 */
export class CallbackOverride extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CallbackOverride";
    }
}

/*
 * Wrong bot options
 */
export class OptionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OptionsError";
    }
}

/*
 * Ошибка парсинга сообщения
 */
export class ParserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ParserError";
    }
}

/*
 * Wrong message tags
 */
export class FileNotFound extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FileNotFound";
    }
}
