export class GameError extends Error {
    code;
    status;
    constructor(code, message, status = 400) { super(message); this.name = 'GameError'; this.code = code; this.status = status; }
}
