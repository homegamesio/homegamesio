const { Game, GameNode, Shapes, ShapeUtils } = require('squish-150');

// @example-settings:start
// Try changing these values.
const SHAPE = 'square';
const SQUARE_SIZE = 24;
const SQUARE_COLOR = [247, 187, 90, 255];
// @example-settings:end

class Example extends Game {
    static metadata() {
        return {
            gameId: "8c720f3c-3e3b-45fa-9ef0-3356f142e368",
            name: 'Make a shape',
            aspectRatio: { x: 1, y: 1 }, maxPlayers: 1,
            
        };
    }

    constructor() {
        super();
        this.base = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(0, 0, 100, 100), fill: [22, 34, 45, 255] });
        // @example-code:start
        const left = 50 - SQUARE_SIZE / 2;
        const top = 50 - SQUARE_SIZE / 2;
        this.square = new GameNode.Shape({
            shapeType: Shapes.POLYGON,
            coordinates2d: SHAPE === 'triangle'
                ? [[50, top], [left + SQUARE_SIZE, top + SQUARE_SIZE], [left, top + SQUARE_SIZE]]
                : ShapeUtils.rectangle(left, top, SQUARE_SIZE, SQUARE_SIZE),
            fill: SQUARE_COLOR
        });
        this.base.addChild(this.square);
        // @example-code:end
    }

    getLayers() { return [{ root: this.base }]; }
}

module.exports = Example;
