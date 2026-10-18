const { Game, GameNode, Shapes, ShapeUtils } = require('squish-150');

// @example-settings:start
const SQUARE_COLOR = [247, 187, 90, 255];
const TARGET_SCORE = 5;
// @example-settings:end

class Example extends Game {
    static metadata() {
        return {
            gameId: "230f287d-c8f1-42e8-be3d-76797a3f1d9d", name: 'Win and restart', aspectRatio: { x: 1, y: 1 }, maxPlayers: 1,  };
    }
    constructor() {
        super();
        this.base = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(0, 0, 100, 100), fill: [245, 247, 249, 255] });
        this.score = 0;
        this.won = false;
        this.pressed = new Set();
        this.message = new GameNode.Text({ textInfo: {
            text: '0 / ' + TARGET_SCORE, x: 50, y: 20, size: 5, align: 'center', color: [30, 40, 50, 255]
        } });
        this.target = new GameNode.Shape({ shapeType: Shapes.POLYGON,
            coordinates2d: ShapeUtils.rectangle(30, 40, 40, 25), fill: SQUARE_COLOR,
            onClick: playerId => this.tapTarget(playerId) });
        this.base.addChildren(this.message, this.target);
    }
    // @example-code:start
    tapTarget(playerId) {
        if (this.pressed.has(playerId)) return;
        this.pressed.add(playerId);
        this.score = this.won ? 0 : this.score + 1;
        this.won = this.score >= TARGET_SCORE;
        this.message.node.text.text = this.won ? 'You win! Tap to restart' : this.score + ' / ' + TARGET_SCORE;
        this.target.node.fill = this.won ? [180, 230, 120, 255] : SQUARE_COLOR;
        this.base.node.onStateChange();
    }
    handleMouseUp(playerId) { this.pressed.delete(playerId); }
    handlePlayerDisconnect(playerId) { this.pressed.delete(playerId); }
    // @example-code:end
    getLayers() { return [{ root: this.base }]; }
}
module.exports = Example;
