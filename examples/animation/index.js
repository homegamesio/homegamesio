const { Game, GameNode, Shapes, ShapeUtils } = require('squish-150');

// @example-settings:start
const SQUARE_COLOR = [247, 187, 90, 255];
const MOVE_STEP = 24;
// @example-settings:end

class Example extends Game {
    static metadata() {
        return {
            gameId: "6ccd3e20-143d-405d-9aa0-4f2d7d7eb3dd", name: 'Make it move', aspectRatio: { x: 1, y: 1 }, maxPlayers: 1, tickRate: 30, };
    }
    constructor() {
        super();
        this.base = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(0, 0, 100, 100), fill: [245, 247, 249, 255] });
        this.x = 10;
        this.direction = 1;
        this.box = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(this.x, 40, 12, 12), fill: SQUARE_COLOR });
        this.base.addChild(this.box);
    }
    // @example-code:start
    tick() {
        this.x += this.direction * MOVE_STEP / 30; // units per second / ticks per second
        if (this.x >= 88 || this.x <= 0) {
            this.x = Math.max(0, Math.min(88, this.x));
            this.direction *= -1;
        }
        this.box.update({ coordinates2d: ShapeUtils.rectangle(this.x, 40, 12, 12) });
    }
    // @example-code:end
    getLayers() { return [{ root: this.base }]; }
}
module.exports = Example;
