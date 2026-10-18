const { Game, GameNode, Shapes, ShapeUtils } = require('squish-150');

// @example-settings:start
// Try changing these values.
const SQUARE_SIZE = 24;
const SQUARE_COLOR = [247, 187, 90, 255];
const POINTS_PER_CLICK = 1;
// @example-settings:end

class Example extends Game {
    static metadata() {
        return {
            gameId: "bd3b69c6-1f4c-43fc-8bdd-90bb1439abd5",
            name: 'Make it clickable',
            aspectRatio: { x: 1, y: 1 }, maxPlayers: 1,
            
        };
    }

    constructor() {
        super();
        this.pressed = new Set();
        this.base = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(0, 0, 100, 100), fill: [22, 34, 45, 255] });
        this.square = new GameNode.Shape({
            shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(50 - SQUARE_SIZE / 2, 50 - SQUARE_SIZE / 2, SQUARE_SIZE, SQUARE_SIZE),
            fill: SQUARE_COLOR,
            onClick: playerId => this.clickSquare(playerId)
        });
        this.base.addChild(this.square);
        this.count = 0;
        this.label = new GameNode.Text({ textInfo: {
            text: 'Clicks: 0', x: 50, y: 78, size: 4, align: 'center', color: [247, 250, 252, 255]
        } });
        this.base.addChild(this.label);
    }

    // @example-code:start
    // Clicks change state; the label shows that state.
    clickSquare(playerId) {
        if (this.pressed.has(playerId)) return;
        this.pressed.add(playerId);
        this.count += POINTS_PER_CLICK;
        this.label.node.text.text = 'Clicks: ' + this.count;
        this.base.node.onStateChange();
    }

    // @example-code:end

    handlePlayerDisconnect(playerId) { this.pressed.delete(playerId); }
    handleMouseUp(playerId) { this.pressed.delete(playerId); }

    getLayers() { return [{ root: this.base }]; }
}

module.exports = Example;
