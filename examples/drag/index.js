const { Game, GameNode, Shapes, ShapeUtils } = require('squish-151');

// @example-settings:start
const SQUARE_SIZE = 18;
const SQUARE_COLOR = [247, 187, 90, 255];
const GRID_SIZE = 0;
// @example-settings:end

class Example extends Game {
    static metadata() {
        return {
            gameId: "b0e02da0-d899-40c6-b903-4933486dd979", name: 'Drag and drop',
            aspectRatio: { x: 1, y: 1 }, maxPlayers: 1 };
    }

    constructor() {
        super();
        this.x = 20;
        this.y = 42;
        this.grabs = new Map();
        this.base = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(0, 0, 100, 100), fill: [22, 34, 45, 255] });
        if (GRID_SIZE) {
            for (let x = 0; x <= 100; x += GRID_SIZE) {
                for (let y = 10; y <= 70; y += GRID_SIZE) {
                    this.base.addChild(new GameNode.Shape({ shapeType: Shapes.POLYGON,
                        coordinates2d: ShapeUtils.rectangle(x, y, 0.5, 0.5), fill: [66, 85, 99, 255] }));
                }
            }
        }
        this.base.addChild(new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(68, 36, 26, 26),
            fill: [22, 34, 45, 255], color: [125, 220, 185, 255], border: 10 }));
        this.square = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(this.x, this.y, SQUARE_SIZE, SQUARE_SIZE), fill: SQUARE_COLOR,
            onClick: (playerId, x, y) => this.grab(playerId, x, y),
            onDrag: (playerId, x, y) => this.drag(playerId, x, y),
            offClick: (playerId, x, y) => this.drop(playerId, x, y) });
        this.label = new GameNode.Text({ textInfo: { text: 'Drag the square into the outline',
            x: 50, y: 80, size: 3, align: 'center', color: [247, 250, 252, 255] } });
        this.base.addChildren(this.square, this.label);
    }

    // @example-code:start
    grab(playerId, x, y) {
        // Keep the original grab point while the pointer is held down.
        if (this.grabs.has(playerId)) return;
        this.grabs.set(playerId, { dx: x - this.x, dy: y - this.y });
        this.label.node.text.text = 'Move it, then let go';
        this.base.node.onStateChange();
    }

    drag(playerId, x, y) {
        const grab = this.grabs.get(playerId);
        if (!grab) return;
        const snap = value => GRID_SIZE ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
        this.x = Math.max(0, Math.min(100 - SQUARE_SIZE, snap(x - grab.dx)));
        this.y = Math.max(10, Math.min(72 - SQUARE_SIZE, snap(y - grab.dy)));
        this.square.update({ coordinates2d: ShapeUtils.rectangle(this.x, this.y, SQUARE_SIZE, SQUARE_SIZE) });
    }

    drop(playerId, x, y) {
        // Use the release position too, even after a very quick drag.
        if (Number.isFinite(x) && Number.isFinite(y)) this.drag(playerId, x, y);
        if (!this.grabs.delete(playerId)) return;
        const inOutline = this.x >= 68 && this.x + SQUARE_SIZE <= 94
            && this.y >= 36 && this.y + SQUARE_SIZE <= 62;
        this.label.node.text.text = inOutline ? 'Nice drop!' : 'Try dropping in the outline.';
        this.base.node.onStateChange();
    }
    // @example-code:end

    handlePlayerDisconnect(playerId) { this.drop(playerId); }
    getLayers() { return [{ root: this.base }]; }
}

module.exports = Example;
