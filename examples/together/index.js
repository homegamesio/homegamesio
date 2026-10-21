const { Game, GameNode, Shapes, ShapeUtils, Asset } = require('squish-151');

// @example-settings:start
// Try changing these values.
const SQUARE_SIZE = 24;
const SQUARE_COLOR = [247, 187, 90, 255];
const POINTS_PER_CLICK = 1;
const SOUND = 'chime';
// @example-settings:end

class Example extends Game {
    static metadata() {
        return {
            gameId: "4da34d54-5639-4a3a-9931-c3ec7c744956",
            name: 'Play together',
            aspectRatio: { x: 1, y: 1 }, maxPlayers: 4,
            assets: { chime: new Asset({ path: './assets/chime.wav', type: 'audio' }), pop: new Asset({ path: './assets/pop.wav', type: 'audio' }) },
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
        this.players = new Map();
        this.roster = new GameNode.Text({ textInfo: {
            text: '', x: 50, y: 18, size: 3, align: 'center', color: [160, 210, 210, 255]
        } });
        this.base.addChild(this.roster);
        this.names = new GameNode.Text({ textInfo: {
            text: '', x: 50, y: 25, size: 2.2, align: 'center', color: [160, 210, 210, 255]
        } });
        this.base.addChild(this.names);
    }

    // Clicks change state; the label shows that state.
    clickSquare(playerId) {
        if (this.pressed.has(playerId)) return;
        this.pressed.add(playerId);
        this.count += POINTS_PER_CLICK;
        this.label.node.text.text = 'Clicks: ' + this.count;
        // Add a sound node on each click. The audio file travels with this game.
        this.square.clearChildren();
        this.square.addChild(new GameNode.Asset({
            coordinates2d: ShapeUtils.rectangle(0, 0, 0, 0),
            assetInfo: { [SOUND]: { pos: { x: 0, y: 0 }, size: { x: 0, y: 0 }, startTime: 0 } }
        }));
        this.base.node.onStateChange();
    }

    // @example-code:start
    // Names arrive when players connect and whenever they change them.
    // Keep playerId as the key: two people can choose the same name.
    handleNewPlayer({ playerId, info }) {
        this.players.set(playerId, info.name);
        this.updateRoster();
    }
    handlePlayerUpdate(playerId, { info }) {
        this.players.set(playerId, info.name);
        this.updateRoster();
    }
    handlePlayerDisconnect(playerId) {
        this.pressed.delete(playerId);
        this.players.delete(playerId);
        this.updateRoster();
    }
    updateRoster() {
        this.roster.node.text.text = this.players.size + (this.players.size === 1 ? ' player' : ' players');
        const names = [...this.players.values()].join(', ');
        this.names.node.text.text = names.length > 62 ? names.slice(0, 59) + '…' : names;
        this.base.node.onStateChange();
    }
    // @example-code:end

    handleMouseUp(playerId) { this.pressed.delete(playerId); }

    getLayers() { return [{ root: this.base }]; }
}

module.exports = Example;
