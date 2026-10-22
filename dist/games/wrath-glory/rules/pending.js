export function validatePendingDecision(p) {
    const errors = [];
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
export function validateDecisionResponse(response, pending) {
    const errors = [];
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
