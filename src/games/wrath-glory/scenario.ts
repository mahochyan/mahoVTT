import { existsSync, readFileSync } from 'node:fs';

/** Scenario-pack contract. A pack contains only scene structure, tests, flags,
 * clues, threat references and original adaptation text; official prose and
 * stat blocks stay in the private data pack. */
export type ScenarioTest = {
    attribute: 'strength' | 'toughness' | 'agility' | 'initiative' | 'willpower' | 'intellect' | 'fellowship';
    skill?: string;
    dn: number;
};

export type ScenarioOutcome = { text?: string; clue?: string; flag?: string; shock?: number };

export type ScenarioChoice = {
    id: string;
    label: string;
    test?: ScenarioTest;
    requires?: { flag?: string; clue?: string };
    success?: ScenarioOutcome;
    failure?: ScenarioOutcome;
    next: string;
};

export type ScenarioScene = {
    id: string;
    part: string;
    title: string;
    text: string;
    choices: ScenarioChoice[];
    combat?: { enemies: string[]; victory: string; intro?: string };
    corruption?: { dn: number; text: string };
    ending?: { id: string; title: string; text: string };
};

export type ThreatSpec = {
    id: string;
    name: string;
    archetype: string;
    defence: number;
    resilience: number;
    maxWounds: number;
    maxShock: number;
    damage: number;
    ed: number;
    short: number;
    medium: number;
    long: number;
    attackPool?: number;
    fear?: number;
    onFire?: boolean;
    deathSplit?: string;
    ruin?: { cost: number; bonusDamage: number; text: string };
};

export type ScenarioPack = {
    id: string;
    title: string;
    subtitle: string;
    tier: number;
    minutes: number;
    sourceBook: string;
    adaptation: string;
    startScene: string;
    scenes: ScenarioScene[];
    threats: Record<string, ThreatSpec>;
    clues: Record<string, string>;
};

export function loadScenarioPack(path: string): ScenarioPack {
    if (!existsSync(path))
        throw new Error(`Scenario pack not installed: ${path}`);
    const pack = JSON.parse(readFileSync(path, 'utf8')) as ScenarioPack;
    const errors = validateScenarioPack(pack);
    if (errors.length)
        throw new Error(`Invalid scenario pack: ${errors.join('; ')}`);
    return pack;
}

export function validateScenarioPack(pack: ScenarioPack): string[] {
    const errors: string[] = [];
    if (!pack.id || !pack.title)
        errors.push('id and title are required');
    const ids = new Set(pack.scenes.map((s) => s.id));
    if (!ids.has(pack.startScene))
        errors.push(`startScene "${pack.startScene}" does not exist`);
    for (const scene of pack.scenes) {
        const choiceIds = new Set<string>();
        for (const choice of scene.choices) {
            if (choiceIds.has(choice.id))
                errors.push(`duplicate choice ${scene.id}/${choice.id}`);
            choiceIds.add(choice.id);
            if (choice.next && !ids.has(choice.next))
                errors.push(`choice ${scene.id}/${choice.id} points to missing scene ${choice.next}`);
            if (choice.test && (!Number.isInteger(choice.test.dn) || choice.test.dn < 0))
                errors.push(`choice ${scene.id}/${choice.id} has invalid DN`);
            if (choice.requires?.clue && !pack.clues[choice.requires.clue])
                errors.push(`choice ${scene.id}/${choice.id} requires unknown clue`);
        }
        if (scene.corruption && (!Number.isInteger(scene.corruption.dn) || scene.corruption.dn < 0))
            errors.push(`scene ${scene.id} has invalid Corruption DN`);
        if (scene.combat) {
            if (!ids.has(scene.combat.victory))
                errors.push(`combat in ${scene.id} points to missing victory scene`);
            if (!scene.combat.enemies.length)
                errors.push(`combat in ${scene.id} has no enemies`);
            for (const enemy of scene.combat.enemies)
                if (!pack.threats[enemy])
                    errors.push(`combat in ${scene.id} references unknown threat ${enemy}`);
        }
    }
    return errors;
}

export function findScene(pack: ScenarioPack, id: string): ScenarioScene {
    const scene = pack.scenes.find((s) => s.id === id);
    if (!scene)
        throw new Error(`Unknown scene: ${id}`);
    return scene;
}

/** Public projection: no success/failure text until the choice resolves. */
export function publicScene(pack: ScenarioPack, id: string) {
    const scene = findScene(pack, id);
    return {
        id: scene.id,
        part: scene.part,
        title: scene.title,
        text: scene.text,
        combat: scene.combat ? { intro: scene.combat.intro || '', enemies: scene.combat.enemies } : null,
        ending: scene.ending || null,
        choices: scene.choices.map((c) => ({ id: c.id, label: c.label, test: c.test ? { dn: c.test.dn } : null })),
    };
}
