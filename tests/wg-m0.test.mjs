import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALLOWED_SOURCES, REJECTED_SOURCES, assertAllowedSource, isRejectedSource } from '../dist/games/wrath-glory/rules/sources.js';
import { RULES, getRule, requireRule, validateRegistry } from '../dist/games/wrath-glory/rules/registry.js';
import { attackPool, countIcons, criticalHit, damageVsResilience, defence, determination, influence, isAnnihilated, isDying, maxShock, maxWounds, rangeBand, resilience, resolve, ruinMax, woundedPenalty } from '../dist/games/wrath-glory/rules/formulas.js';
import { derivedTraits, validatePregen } from '../dist/games/wrath-glory/rules/pregen.js';

test('source lock: C7 allowed, Ulisses rejected', () => {
    assert.ok(ALLOWED_SOURCES['wg-c7-core']);
    assert.ok(isRejectedSource('wg-ulisses-core'));
    assert.equal(REJECTED_SOURCES['wg-ulisses-core'].includes('Ulisses'), true);
    assert.throws(() => assertAllowedSource('wg-ulisses-core'), /not allowed/);
    assert.throws(() => assertAllowedSource('some-homebrew'), /not allowed/);
    assert.doesNotThrow(() => assertAllowedSource('wg-c7-core'));
});

test('rule registry is traceable and contains no foreign edition', () => {
    assert.doesNotThrow(() => validateRegistry());
    assert.ok(RULES.length >= 15);
    for (const rule of RULES) {
        assert.ok(rule.id);
        assert.ok(rule.printedPage >= 1);
        assert.ok(ALLOWED_SOURCES[rule.sourceBook], rule.id);
        assert.notEqual(rule.verification, 'missing', rule.id);
    }
    assert.equal(getRule('ruin.max').value, '2 * playerCount');
    assert.equal(getRule('weapon.ranges').value.bands.length, 3);
    assert.equal(getRule('maxWounds').verification, 'verified');
    assert.ok(getRule('maxWounds').errataRef);
    assert.throws(() => requireRule('nope'), /Unknown/);
});

test('attributes, derived traits, and errata-sensitive Wounds', () => {
    assert.equal(maxWounds(3, 1, { errata: true }), 5);
    assert.equal(maxWounds(3, 1, { errata: false }), 4);
    assert.equal(maxShock(3, 1), 4);
    assert.equal(defence(3), 2);
    assert.equal(defence(1), 1);
    assert.equal(resilience(3, 2), 6);
    assert.equal(resolve(3), 2);
    assert.equal(influence(1), 1);
    assert.equal(ruinMax(3), 6);
});

test('wounds are cumulative; Wounded and Dying are separate states', () => {
    assert.equal(woundedPenalty(0), 0);
    assert.equal(woundedPenalty(1), 1);
    assert.equal(isDying(4, 5), false);
    assert.equal(isDying(6, 5), true);
    assert.equal(isAnnihilated(10, 5), false);
    assert.equal(isAnnihilated(11, 5), true);
});

test('damage vs Resilience and Determination', () => {
    assert.deepEqual(damageVsResilience(7, 8, 1), { wounds: 0, shock: 0 });
    assert.deepEqual(damageVsResilience(8, 8, 2), { wounds: 0, shock: 2 });
    assert.deepEqual(damageVsResilience(10, 8, 1), { wounds: 2, shock: 0 });
    assert.throws(() => damageVsResilience(8, 8, 4), /Invalid/);
    assert.deepEqual(determination([4, 5, 6]), { woundsConverted: 4, shock: 4, icons: 4 });
    assert.deepEqual(determination([1, 2, 3]), { woundsConverted: 0, shock: 0, icons: 0 });
});

test('attack pools, critical condition, and three range bands', () => {
    assert.equal(attackPool({ mode: 'melee', initiative: 3, weaponSkill: 2, agility: 3, ballisticSkill: 3 }), 5);
    assert.equal(attackPool({ mode: 'ranged', initiative: 3, weaponSkill: 2, agility: 3, ballisticSkill: 3 }), 6);
    assert.equal(criticalHit(false, 6), false);
    assert.equal(criticalHit(true, 6), true);
    assert.equal(criticalHit(true, 5), false);
    assert.equal(rangeBand(12, 12, 24, 36), 'short');
    assert.equal(rangeBand(13, 12, 24, 36), 'medium');
    assert.equal(rangeBand(25, 12, 24, 36), 'long');
    assert.equal(rangeBand(37, 12, 24, 36), 'out');
    assert.equal(rangeBand(24, 12, 24, 36), 'medium');
});

test('icon faces: 1-3 blank, 4-5 icon, 6 exalted', () => {
    assert.deepEqual(countIcons([1, 2, 3]), { icons: 0, exalted: 0, blanks: 3, wrathSix: false, wrathOne: false });
    assert.deepEqual(countIcons([4, 5]), { icons: 2, exalted: 0, blanks: 0, wrathSix: false, wrathOne: false });
    assert.deepEqual(countIcons([6]), { icons: 2, exalted: 1, blanks: 0, wrathSix: false, wrathOne: false });
    assert.deepEqual(countIcons([4, 6, 1], 1), { icons: 3, exalted: 1, blanks: 1, wrathSix: true, wrathOne: false });
    assert.deepEqual(countIcons([4, 6, 1], 2), { icons: 3, exalted: 1, blanks: 1, wrathSix: false, wrathOne: true });
    assert.throws(() => countIcons([7]), /Invalid/);
});

test('public demo pregens satisfy the Tier 1 schema', () => {
    const party = JSON.parse(readFileSync(new URL('../content/wg/prefabs/example-original.json', import.meta.url), 'utf8'));
    assert.equal(party.pregens.length, 3);
    for (const p of party.pregens) {
        assert.deepEqual(validatePregen(p), [], p.id);
        assert.equal(p.tier, 1);
        assert.ok(p.keywords.includes('IMPERIUM'));
        const d = derivedTraits(p);
        assert.equal(d.maxWounds, p.attributes.toughness + 2 * p.tier);
    }
});

test('Graveyard Shift dependency table is complete and test-linked', () => {
    const data = JSON.parse(readFileSync(new URL('../content/wg/dependencies/graveyard-shift.json', import.meta.url), 'utf8'));
    assert.equal(data.scenarioId, 'graveyard-shift');
    assert.equal(data.sourceBook, 'wg-c7-graveyard-shift');
    assert.ok(data.dependencies.length >= 8);
    const ids = new Set();
    const testIds = new Set();
    for (const dep of data.dependencies) {
        assert.ok(dep.id && !ids.has(dep.id), dep.id);
        ids.add(dep.id);
        assert.ok(dep.testId && dep.testId.startsWith('wg.'), dep.id);
        assert.ok(!testIds.has(dep.testId), dep.testId);
        testIds.add(dep.testId);
        assert.ok(['declared', 'implemented', 'adapted'].includes(dep.status), dep.id);
        assert.notEqual(dep.description.trim(), '', dep.id);
    }
});
