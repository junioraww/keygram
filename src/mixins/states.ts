export class StateManagerMixin {
    states: StateManager = new StateManager();
    cacheRemoverInterval: NodeJS.Timeout | null = null;
    statesEnabled = true;
    
    disableStates(): void {
        this.statesEnabled = false;
    }
    
    _startStateCacheRemover(intervalMs: number = 1000): void {
        if (this.cacheRemoverInterval) {
            this._stopCacheRemover();
        }
        
        this.cacheRemoverInterval = setInterval(() => {
            const sec = now();
            const cache = this.states.cache; 
            
            for (const userId in cache) {
                if (Object.prototype.hasOwnProperty.call(cache, userId)) {
                    if (cache[userId].ex < sec) {
                        this.states.delete(Number(userId));
                    }
                }
            }
            
            const diff = this.states.size - this.states.maxSize;
            if (diff > 0) {
                const entries = Object.entries(cache);
                entries.sort((a, b) => a[1].ex - b[1].ex);
                for (let i = 0; i < diff; i++) {
                    const userIdToDelete = entries[i][0];
                    this.states.delete(Number(userIdToDelete));
                }
            }
        }, intervalMs);
    }
    
    _stopCacheRemover(): void {
        if (this.cacheRemoverInterval) {
            clearInterval(this.cacheRemoverInterval);
            this.cacheRemoverInterval = null;
        }
    }
}

interface StateEntry {
    ex: number, // remove from cache at X
    val: any    // stored value
}

export class StateManager {
    cache: Record<number, StateEntry> = {};
    unloadAfter: number = 60;
    maxSize: number = 100;
    size: number = 0;
    
    setUnloadAfter(seconds: number) {
        this.unloadAfter = seconds;
    }
    
    setMaxSize(amount: number) {
        this.maxSize = amount;
    }
    
    save: any = () => {
        console.warn('State save not implemented')
    }
    
    load: any = () => {
        return {}
    }
    
    get: any = async (ctx: any): Promise<any> => {
        const { id } = ctx.from;
        const entry = this.cache[id];
        if (entry) {
            entry.ex = now() + this.unloadAfter;
            return entry.val;
        }
        const val = await this.load(ctx);
        this.cache[id] = {
            ex: now() + this.unloadAfter,
            val: val,
        };
        this.size++; 
        return val;
    }
    
    set: any = (ctx: any, new_value: any): Promise<any> => {
        const { id } = ctx.from;
        if (!this.cache[id]) {
            this.size++;
        }
        this.cache[id] = {
            ex: now() + this.unloadAfter,
            val: new_value,
        };
        return this.save(ctx, new_value);
    }
    
    delete(id: number): boolean {
        if (this.cache[id]) {
            delete this.cache[id];
            this.size--;
            return true;
        }
        return false;
    }
}

function now(): number {
    return Math.floor(Date.now() / 1000);
}

