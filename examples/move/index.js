const { Game, GameNode, Shapes, ShapeUtils } = require('squish-151');

// @example-settings:start
const SQUARE_SIZE = 12;
const SQUARE_COLOR = [247, 187, 90, 255];
const MOVE_STEP = 3;
// @example-settings:end

class Example extends Game {
    static metadata() {
        return {
            gameId: "b843093b-eaf5-44da-bedd-dc31e1100c50", name: 'Move it around',
            aspectRatio: { x: 1, y: 1 }, maxPlayers: 1 };
    }

    constructor() {
        super();
        this.x = 18;
        this.y = 48;
        this.base = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(0, 0, 100, 100), fill: [22, 34, 45, 255] });
        this.base.addChild(new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(72, 18, 20, 20),
            fill: [22, 34, 45, 255], color: [125, 220, 185, 255], border: 10 }));
        this.square = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(this.x, this.y, SQUARE_SIZE, SQUARE_SIZE), fill: SQUARE_COLOR });
        this.label = new GameNode.Text({ textInfo: { text: 'Reach the outline',
            x: 50, y: 70, size: 3, align: 'center', color: [247, 250, 252, 255] } });
        this.base.addChildren(this.square, this.label);
        // On-screen buttons use the same movement as the keyboard.
        [['←', -1, 0], ['↑', 0, -1], ['↓', 0, 1], ['→', 1, 0]].forEach(([text, dx, dy], i) => {
            const x = 10 + i * 21;
            const button = new GameNode.Shape({ shapeType: Shapes.POLYGON,
                coordinates2d: ShapeUtils.rectangle(x, 80, 17, 14), fill: [51, 70, 84, 255],
                onClick: () => this.move(dx, dy) });
            button.addChild(new GameNode.Text({ textInfo: { text, x: x + 8.5, y: 83,
                size: 6, align: 'center', color: [247, 250, 252, 255] } }));
            this.base.addChild(button);
        });
    }

    // @example-code:start
    move(dx, dy) {
        // Keep the whole square inside the play area.
        this.x = Math.max(4, Math.min(96 - SQUARE_SIZE, this.x + dx * MOVE_STEP));
        this.y = Math.max(8, Math.min(64 - SQUARE_SIZE, this.y + dy * MOVE_STEP));
        this.square.update({ coordinates2d: ShapeUtils.rectangle(this.x, this.y, SQUARE_SIZE, SQUARE_SIZE) });
        const reachedGoal = this.x >= 72 && this.x + SQUARE_SIZE <= 92
            && this.y >= 18 && this.y + SQUARE_SIZE <= 38;
        this.label.node.text.text = reachedGoal ? 'You reached the goal!' : 'Reach the outline';
        this.base.node.onStateChange();
    }

    handleKeyDown(playerId, key) {
        const directions = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0],
            ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] };
        const direction = directions[key] || directions[key.toLowerCase()];
        if (direction) this.move(...direction);
    }
    // @example-code:end

    getLayers() { return [{ root: this.base }]; }
}

module.exports = Example;
