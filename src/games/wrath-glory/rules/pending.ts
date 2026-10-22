/** Recoverable interaction states. A pause is persisted in the same transaction
 * as the roll that created it; refreshing must not re-roll or re-spend. */
export type DecisionPhase = 'wrath-reroll' | 'shift' | 'determination';

export type PendingDecision = {
    id: string;
    decisionId: string;
    actionId: string;
    actorId: string;
    phase: DecisionPhase;
    allowedChoices: string[];
    relatedRollIds: string[];
    requestId: string;
    expectedPhase: DecisionPhase;
};

export type DecisionResponse = {
    decisionId: string;
    requestId: string;
    choice: string;
    allocation?: Record<string, number>;
};

export function validatePendingDecision(p: PendingDecision): string[] {
    const errors: string[] = [];
    if (!p.id || !p.decisionId || !p.actionId || !p.actorId)
        errors.push('decision identity fields are required');
    if (p.phase !== p.expectedPhase)
        errors.push('phase does not match expectedPhase');
    if (!p.allowedChoices.length)
        errors.push('allowedChoices must not be empty');
    if (!p.relatedRollIds.length)
        errors.push('relatedRollIds must not be empty');
    if (!p.requestId)
        errors.push('requestId is required');
    return errors;
}

export function validateDecisionResponse(response: DecisionResponse, pending: PendingDecision): string[] {
    const errors: string[] = [];
    if (response.decisionId !== pending.decisionId)
        errors.push('decisionId does not match the pending decision');
    if (!response.requestId)
        errors.push('requestId is required');
    if (!pending.allowedChoices.includes(response.choice))
        errors.push(`choice "${response.choice}" is not allowed`);
    if (response.allocation) {
        for (const [key, value] of Object.entries(response.allocation)) {
            if (!Number.isInteger(value) || value < 0)
                errors.push(`allocation ${key} must be a non-negative integer`);
        }
    }
    return errors;
}
