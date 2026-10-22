import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateShift, rerollFailures, rollDamage, rollDetermination, rollPool, rollTest, shiftableExalted } from '../dist/games/wrath-glory/rules/dice.js';
import { validateDecisionResponse, validatePendingDecision } from '../dist/games/wrath-glory/rules/pending.js';

function seq(faces) {
    let i = 0;
    return () => {
        if (i >= faces.length)
            throw new Error('RNG sequence exhausted');
        return (faces[i++] - 0.5) / 6;
    };
}

test('rollPool counts icons and marks the Wrath Die', () => {
    const r = rollPool(5, seq([1, 4, 6, 2, 5]), { wrathIndex: 2 });
    assert.deepEqual(r.faces, [1, 4, 6, 2, 5]);
    assert.equal(r.icons, 4);
    assert.equal(r.exalted, 1);
    assert.equal(r.blanks, 2);
    assert.equal(r.wrathSix, true);
    assert.equal(r.wrathOne, false);
});

test('rollTest computes success and shiftable Exalted', () => {
    const r = rollTest(4, 3, seq([4, 5, 4, 6]));
    assert.equal(r.icons, 5);
    assert.equal(r.success, true);
    assert.equal(shiftableExalted(r, 3), 1);
    const tight = rollTest(3, 3, seq([4, 4, 6]));
    assert.equal(tight.success, true);
    assert.equal(shiftableExalted(tight, 3), 0);
    const failed = rollTest(2, 4, seq([4, 6]));
    assert.equal(failed.success, false);
    assert.equal(shiftableExalted(failed, 3), 0);
});

test('shift allocation is bounded and Glory is capped at one', () => {
    const r = rollTest(4, 3, seq([4, 5, 4, 6]));
    assert.deepEqual(allocateShift(r, 3, { toDamage: 1 }), { toDamage: 1, remaining: 0 });
    assert.throws(() => allocateShift(r, 3, { toDamage: 2 }), /Only 1/);
    const rich = rollTest(5, 3, seq([4, 5, 4, 6, 6]));
    assert.equal(shiftableExalted(rich, 3), 2);
    assert.throws(() => allocateShift(rich, 3, { toGlory: 2 }), /At most one/);
    assert.throws(() => allocateShift(r, 3, { toInfo: -1 }), /non-negative/);
});

test('Wrath re-roll keeps the Wrath Die and non-failures', () => {
    const first = rollPool(4, seq([1, 2, 6, 4]), { wrathIndex: 0 });
    const second = rerollFailures(first, seq([5]));
    assert.deepEqual(second.faces, [1, 5, 6, 4]);
    assert.equal(second.wrathOne, true);
    assert.equal(second.icons, 1 + 2 + 1);
});

test('damage dice and Determination use icons', () => {
    const dmg = rollDamage(8, 2, seq([4, 5]));
    assert.equal(dmg.bonus, 2);
    assert.equal(dmg.total, 10);
    const det = rollDetermination(3, seq([4, 6, 1]));
    assert.equal(det.icons, 3);
    assert.equal(det.faces.length, 3);
});

test('pending decisions validate identity, choice, and allocation', () => {
    const pending = {
        id: 'p1', decisionId: 'd1', actionId: 'a1', actorId: 'pc1',
        phase: 'shift', allowedChoices: ['damage', 'glory'], relatedRollIds: ['r1'],
        requestId: 'req1', expectedPhase: 'shift',
    };
    assert.deepEqual(validatePendingDecision(pending), []);
    assert.deepEqual(validateDecisionResponse({ decisionId: 'd1', requestId: 'req2', choice: 'glory', allocation: { toGlory: 1 } }, pending), []);
    assert.ok(validateDecisionResponse({ decisionId: 'd1', requestId: 'req2', choice: 'heal' }, pending).length);
    assert.ok(validateDecisionResponse({ decisionId: 'dX', requestId: 'req2', choice: 'glory' }, pending).length);
});
