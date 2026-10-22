import { existsSync, readFileSync } from 'node:fs';
export function loadScenarioPack(path) {
    if (!existsSync(path))
        throw new Error(`Scenario pack not installed: ${path}`);
    const pack = JSON.parse(readFileSync(path, 'utf8'));
    const errors = validateScenarioPack(pack);
    if (errors.length)
        throw new Error(`Invalid scenario pack: ${errors.join('; ')}`);
    return pack;
}
export function validateScenarioPack(pack) {
    const errors = [];
    if (!pack.id || !pack.title)
        errors.push('id and title are required');
    const ids = new Set(pack.scenes.map((s) => s.id));
    if (!ids.has(pack.startScene))
        errors.push(`startScene "${pack.startScene}" does not exist`);
    for (const scene of pack.scenes) {
        const choiceIds = new Set();
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
export function findScene(pack, id) {
    const scene = pack.scenes.find((s) => s.id === id);
    if (!scene)
        throw new Error(`Unknown scene: ${id}`);
    return scene;
}
/** Public projection: no success/failure text until the choice resolves. */
export function publicScene(pack, id) {
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
