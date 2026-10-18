'use strict';
// Each recipe is split by its real insertion point in a Blank template.
// The same blocks are compiled and exercised by test/studio-snippets.test.js.
const studioSnippetRecipes = [
    { id: 'shape', category: 'Drawing', title: 'Draw a rectangle',
        description: 'Position a colored shape using the 0–100 game coordinates.', reference: 'drawing',
        setup: `this.box = new GameNode.Shape({
    shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(40, 40, 20, 20), // x, y, width, height
    fill: [100, 200, 240, 255] // red, green, blue, alpha
});
this.base.addChild(this.box);` },
    { id: 'score', category: 'Drawing', title: 'Show and update a score',
        description: 'Keep the number in game state and update its text when points change.', reference: 'changing',
        setup: `this.score = 0;
this.scoreLabel = new GameNode.Text({ textInfo: {
    text: 'Score: 0', x: 50, y: 10, size: 4,
    align: 'center', color: [30, 40, 50, 255]
} });
this.base.addChild(this.scoreLabel);
this.addPoints(1); // Call this when a player earns points.`,
        methods: `addPoints(amount) {
    this.score += amount;
    this.scoreLabel.node.text.text = 'Score: ' + this.score;
    this.base.node.onStateChange();
}` },
    { id: 'button', category: 'Input', title: 'Make a button',
        description: 'A Shape receives the tap; its Text child supplies the label. Holding it down still counts as one press.', reference: 'recipe-button',
        setup: `this.pressed = new Set();
this.buttonOn = false;
this.button = new GameNode.Shape({
    shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(30, 40, 40, 20),
    fill: [100, 200, 240, 255],
    onClick: playerId => {
        if (this.pressed.has(playerId)) return;
        this.pressed.add(playerId);
        this.buttonOn = !this.buttonOn;
        this.button.node.fill = this.buttonOn ? [180, 230, 120, 255] : [100, 200, 240, 255];
        this.buttonLabel.node.text.text = this.buttonOn ? 'ON' : 'OFF';
        this.base.node.onStateChange();
    }
});
this.buttonLabel = new GameNode.Text({ textInfo: {
    text: 'OFF', x: 50, y: 46, size: 4, align: 'center', color: [25, 35, 45, 255]
} });
this.button.addChild(this.buttonLabel);
this.base.addChild(this.button);`,
        methods: `handleMouseUp(playerId) { this.pressed.delete(playerId); }
handlePlayerDisconnect(playerId) { this.pressed.delete(playerId); }` },
    { id: 'movement', category: 'Input', title: 'Move with keys or touch',
        description: 'Arrow keys, WASD and four on-screen buttons use the same bounded movement.', reference: 'input', metadata: 'maxPlayers: 1,',
        setup: `this.x = 44; this.y = 34;
this.actor = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(this.x, this.y, 12, 12), fill: [100, 200, 240, 255] });
this.base.addChild(this.actor);
[['←', -1, 0], ['↑', 0, -1], ['↓', 0, 1], ['→', 1, 0]].forEach(([text, dx, dy], i) => {
    const x = 8 + i * 22;
    const button = new GameNode.Shape({ shapeType: Shapes.POLYGON,
        coordinates2d: ShapeUtils.rectangle(x, 80, 18, 16), fill: [180, 230, 120, 255],
        onClick: () => this.move(dx, dy) });
    button.addChild(new GameNode.Text({ textInfo: {
        text, x: x + 9, y: 84, size: 5, align: 'center', color: [25, 35, 45, 255]
    } }));
    this.base.addChild(button);
});`,
        methods: `move(dx, dy) {
    this.x = Math.max(0, Math.min(88, this.x + dx * 3));
    this.y = Math.max(0, Math.min(64, this.y + dy * 3));
    this.actor.update({ coordinates2d: ShapeUtils.rectangle(this.x, this.y, 12, 12) });
}
handleKeyDown(playerId, key) {
    const directions = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
        arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
    const direction = directions[key.toLowerCase()];
    if (direction) this.move(...direction);
}` },
    { id: 'drag', category: 'Input', title: 'Drag an object',
        description: 'Keep the grab offset so the object follows the mouse or finger without jumping.', reference: 'input', metadata: 'maxPlayers: 1,',
        setup: `this.x = 40; this.y = 40;
this.grab = null;
this.box = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(this.x, this.y, 20, 20), fill: [100, 200, 240, 255],
    onClick: (playerId, x, y) => {
        if (!this.grab) this.grab = { playerId, dx: x - this.x, dy: y - this.y };
    }
});
this.base.addChild(this.box);`,
        methods: `dragTo(playerId, x, y) {
    if (!this.grab || this.grab.playerId !== playerId || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.x = Math.max(0, Math.min(80, x - this.grab.dx));
    this.y = Math.max(0, Math.min(80, y - this.grab.dy));
    this.box.update({ coordinates2d: ShapeUtils.rectangle(this.x, this.y, 20, 20) });
}
handleMouseMove(playerId, { x, y }) { this.dragTo(playerId, x, y); }
handleMouseUp(playerId, position) {
    if (position) this.dragTo(playerId, position.x, position.y);
    if (this.grab?.playerId === playerId) this.grab = null;
}
handlePlayerDisconnect(playerId) { this.handleMouseUp(playerId); }` },
    { id: 'text-input', category: 'Input', title: 'Ask for text',
        description: 'Tap a field to enter a name or guess. The callback receives the full submitted text.', reference: 'input',
        setup: `this.answer = new GameNode.Text({ textInfo: {
    text: 'Tap to type', x: 50, y: 45, size: 4, align: 'center', color: [25, 35, 45, 255]
} });
const field = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(15, 35, 70, 25), fill: [180, 230, 120, 255],
    input: { type: 'text', oninput: (playerId, value) => {
        const text = String(value).trim().slice(0, 24);
        this.answer.node.text.text = text || 'Tap to type';
        this.base.node.onStateChange();
    } }
});
field.addChild(this.answer);
this.base.addChild(field);` },
    { id: 'animation', category: 'Game rules', title: 'Animate with a game loop',
        description: 'Move a square at 24 game units per second. Choose a tick rate explicitly and keep positions inside the scene.', reference: 'game-loop', metadata: 'tickRate: 30,',
        setup: `this.x = 10;
this.direction = 1;
this.box = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(this.x, 40, 12, 12), fill: [100, 200, 240, 255] });
this.base.addChild(this.box);`,
        methods: `tick() {
    this.x += this.direction * 24 / 30; // units per second / ticks per second
    if (this.x >= 88 || this.x <= 0) {
        this.x = Math.max(0, Math.min(88, this.x));
        this.direction *= -1;
    }
    this.box.update({ coordinates2d: ShapeUtils.rectangle(this.x, 40, 12, 12) });
}` },
    { id: 'countdown', category: 'Game rules', title: 'Count down a timer',
        description: 'A ten-second countdown using Game’s timer helper, which is cleaned up when the session ends.', reference: 'game-loop',
        setup: `this.secondsLeft = 10;
this.timerLabel = new GameNode.Text({ textInfo: {
    text: '10', x: 50, y: 40, size: 8, align: 'center', color: [30, 40, 50, 255]
} });
this.base.addChild(this.timerLabel);
this.setInterval(() => {
    if (this.secondsLeft === 0) return;
    this.secondsLeft--;
    this.timerLabel.node.text.text = this.secondsLeft ? String(this.secondsLeft) : "Time's up!";
    this.base.node.onStateChange();
}, 1000);` },
    { id: 'collision', category: 'Game rules', title: 'Detect a collision',
        description: 'A moving box turns green while it overlaps the target. Compare game-state rectangles, not rendered pixels.', reference: 'game-loop', metadata: 'tickRate: 30,',
        setup: `this.actor = { x: 0, y: 42, w: 12, h: 12 };
this.target = { x: 45, y: 35, w: 20, h: 26 };
this.base.addChild(new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(this.target.x, this.target.y, this.target.w, this.target.h),
    fill: [230, 230, 230, 255] }));
this.box = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(0, 42, 12, 12), fill: [100, 200, 240, 255] });
this.base.addChild(this.box);`,
        methods: `overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x
        && a.y < b.y + b.h && a.y + a.h > b.y;
}
tick() {
    this.actor.x += 20 / 30;
    if (this.actor.x > 100 - this.actor.w) this.actor.x = 0;
    this.box.node.fill = this.overlaps(this.actor, this.target) ? [180, 230, 120, 255] : [100, 200, 240, 255];
    this.box.update({ coordinates2d: ShapeUtils.rectangle(this.actor.x, this.actor.y, this.actor.w, this.actor.h) });
}` },
    { id: 'round', category: 'Game rules', title: 'Win and play again',
        description: 'Five separate taps win a round. The next tap starts over without rebuilding the scene.', reference: 'recipes',
        setup: `this.score = 0;
this.won = false;
this.pressed = new Set();
this.message = new GameNode.Text({ textInfo: {
    text: '0 / 5', x: 50, y: 20, size: 5, align: 'center', color: [30, 40, 50, 255]
} });
this.target = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(30, 40, 40, 25), fill: [100, 200, 240, 255],
    onClick: playerId => this.tapTarget(playerId) });
this.base.addChildren(this.message, this.target);`,
        methods: `tapTarget(playerId) {
    if (this.pressed.has(playerId)) return;
    this.pressed.add(playerId);
    this.score = this.won ? 0 : this.score + 1;
    this.won = this.score >= 5;
    this.message.node.text.text = this.won ? 'You win! Tap to restart' : this.score + ' / 5';
    this.target.node.fill = this.won ? [180, 230, 120, 255] : [100, 200, 240, 255];
    this.base.node.onStateChange();
}
handleMouseUp(playerId) { this.pressed.delete(playerId); }
handlePlayerDisconnect(playerId) { this.pressed.delete(playerId); }` },
    { id: 'image', category: 'Media', title: 'Show an image', imports: ['Asset'],
        description: 'Bundle an image with your game so it works in exported copies and offline.', reference: 'assets',
        note: 'Add your image through Assets → Add to game. Replace ./assets/hero.png below with its actual project path. Keep the metadata key and assetInfo key the same.',
        metadata: `assets: { hero: new Asset({ path: './assets/hero.png', type: 'image' }) },`,
        setup: `this.hero = new GameNode.Asset({
    coordinates2d: ShapeUtils.rectangle(30, 30, 40, 40),
    assetInfo: { hero: { pos: { x: 30, y: 30 }, size: { x: 40, y: 40 } } }
});
this.base.addChild(this.hero);` },
    { id: 'sound', category: 'Media', title: 'Play a sound on tap', imports: ['Asset'],
        description: 'Start audio from a player action. Reuse a sound slot so repeated taps do not accumulate nodes.', reference: 'assets',
        note: 'Add an audio file through Assets → Add to game and replace ./assets/chime.wav. Removing a sound stops it; set the cleanup delay to at least the length of your clip.',
        metadata: `assets: { chime: new Asset({ path: './assets/chime.wav', type: 'audio' }) },`,
        setup: `this.pressed = new Set();
this.soundSlot = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(0, 0, 0, 0) });
const button = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(30, 35, 40, 30), fill: [100, 200, 240, 255],
    onClick: playerId => {
        if (this.pressed.has(playerId)) return;
        this.pressed.add(playerId);
        this.playChime();
    }
});
this.base.addChildren(this.soundSlot, button);`,
        methods: `playChime() {
    this.soundSlot.clearChildren();
    const sound = new GameNode.Asset({
        coordinates2d: ShapeUtils.rectangle(0, 0, 0, 0),
        assetInfo: { chime: { pos: { x: 0, y: 0 }, size: { x: 0, y: 0 }, startTime: 0 } }
    });
    this.soundSlot.addChild(sound);
    this.setTimeout(() => this.soundSlot.removeChild(sound.id), 1000);
}
handleMouseUp(playerId) { this.pressed.delete(playerId); }
handlePlayerDisconnect(playerId) { this.pressed.delete(playerId); }` },
    { id: 'glow', category: 'Media', title: 'Glow and fade',
        description: 'Animate color alpha for opacity and effects.shadow for a glow. This fades out over two seconds.', reference: 'drawing', metadata: 'tickRate: 30,',
        setup: `this.life = 60;
this.orb = new GameNode.Shape({ shapeType: Shapes.POLYGON,
    coordinates2d: ShapeUtils.rectangle(40, 40, 20, 20),
    fill: [0, 180, 220, 255], color: [0, 180, 220, 255],
    effects: { shadow: { color: [0, 180, 220, 255], blur: 14 } }
});
this.base.addChild(this.orb);`,
        methods: `tick() {
    if (this.life === 0) return;
    this.life--;
    this.orb.node.color = [0, 180, 220, Math.round(255 * this.life / 60)];
    if (this.life === 0) this.orb.node.effects = null;
    this.base.node.onStateChange();
}` },
    { id: 'players', category: 'Players & progress', title: 'Track players and names',
        description: 'Use playerId as the key. Names can change and two people can choose the same name.', reference: 'players', metadata: "maxPlayers: 4,",
        setup: `this.players = new Map();
this.roster = new GameNode.Text({ textInfo: {
    text: 'Waiting for players', x: 50, y: 20, size: 3, align: 'center', color: [30, 40, 50, 255]
} });
this.base.addChild(this.roster);`,
        methods: `handleNewPlayer({ playerId, info }) {
    this.players.set(playerId, info?.name || 'Player');
    this.updateRoster();
}
handlePlayerUpdate(playerId, { info }) {
    if (!this.players.has(playerId)) return;
    this.players.set(playerId, info?.name || 'Player');
    this.updateRoster();
}
handlePlayerDisconnect(playerId) {
    this.players.delete(playerId);
    this.updateRoster();
}
updateRoster() {
    this.roster.node.text.text = [...this.players.values()].join(', ').slice(0, 64) || 'Waiting for players';
    this.base.node.onStateChange();
}` },
    { id: 'visibility', category: 'Players & progress', title: 'Show each player their own view',
        description: 'A private label per player. Omitted or empty playerIds means everyone; remove a node to hide it.', reference: 'players', metadata: "maxPlayers: 4,",
        setup: `this.privateLabels = new Map();`,
        methods: `handleNewPlayer({ playerId }) {
    const label = new GameNode.Text({
        textInfo: { text: 'Your player ID: ' + playerId, x: 50, y: 20, size: 3,
            align: 'center', color: [30, 40, 50, 255] },
        playerIds: [playerId]
    });
    this.privateLabels.set(playerId, label);
    this.base.addChild(label);
}
handlePlayerDisconnect(playerId) {
    const label = this.privateLabels.get(playerId);
    if (label) this.base.removeChild(label.id);
    this.privateLabels.delete(playerId);
}` },
    { id: 'progress', category: 'Players & progress', title: 'Save a best score',
        description: 'Save player progress between sessions. This is separate from saving source snapshots in Studio.', reference: 'saving-progress', constructorArgs: '{ saveGame, saveData } = {}',
        note: 'This stores one best score for the game installation. Call recordBest(score) when a round ends. Pass plain JSON to saveGame; it returns a promise that can fail.',
        setup: `this.saveProgress = saveGame;
this.pendingBest = Promise.resolve();
this.best = Number.isFinite(saveData?.best) && saveData.best >= 0 ? saveData.best : 0;
this.bestLabel = new GameNode.Text({ textInfo: {
    text: 'Best: ' + this.best, x: 50, y: 20, size: 4, align: 'center', color: [30, 40, 50, 255]
} });
this.base.addChild(this.bestLabel);`,
        methods: `recordBest(score) {
    if (!Number.isFinite(score) || score < 0) return this.pendingBest;
    // Serialize writes so an older score cannot overwrite a newer best.
    this.pendingBest = this.pendingBest.then(async () => {
        if (score <= this.best) return;
        if (!this.saveProgress) {
            this.bestLabel.node.text.text = 'Saving is unavailable';
        } else {
            try {
                await this.saveProgress({ best: score });
                this.best = score;
                this.bestLabel.node.text.text = 'Best: ' + this.best;
            } catch (error) {
                this.bestLabel.node.text.text = 'Could not save. Try again.';
            }
        }
        this.base.node.onStateChange();
    });
    return this.pendingBest;
}` }
];
if (typeof module !== 'undefined' && module.exports) module.exports = studioSnippetRecipes;
else window.StudioSnippets = studioSnippetRecipes;
