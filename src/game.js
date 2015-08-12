(function() {
  var Deck, EventEmitter, Game, Hand, Player, utils,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  EventEmitter = require('events').EventEmitter;

  Deck = require('hoyle').Deck;

  Hand = require('hoyle').Hand;

  Player = require('./player').Player;

  utils = require('util');

  Game = exports.Game = (function(_super) {
    __extends(Game, _super);

    Game.STATUS = {
      NORMAL: 0,
      PRIVILEGED: 1
    };

    function Game(players, betting, hand) {
      var i, player, _i, _len, _ref;
      this.hand = hand || 1;
      this.Betting = betting;
      this.players = players.filter(function(p) {
        return p.chips > 0;
      });
      if (this.players.length < 2) {
        throw "Not enough players";
      }
      if (this.players.length > 22) {
        throw "You can't have more that 22 players. I don't have that many cards";
      }
      _ref = this.players;
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        player = _ref[i];
        player.position = i;
      }
      this.state = null;
      this.reset();
    }

    Game.prototype.reset = function() {
      var player, _i, _len, _ref;
      _ref = this.players;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        player = _ref[_i];
        player.reset();
      }
      this.deck = new Deck();
      this.community = [];
      this.burn = [];
      return this.winners = [];
    };

    Game.prototype.run = function() {
      this.emit('roundStart');
      this.deck.shuffle();
      this.deck.once('shuffled', (function(_this) {
        return function() {
          _this.deal();
          return _this.takeBets();
        };
      })(this));
      return this.on('roundComplete', (function(_this) {
        return function() {
          if (_this.deal()) {
            return _this.takeBets();
          } else {
            return _this.settle();
          }
        };
      })(this));
    };

    Game.prototype.takeBets = function(betting, cb) {
      var betOptions, status;
      betting || (betting = new this.Betting(this.players, this.state));
      betOptions = betting.analyze();
      if (betOptions) {
        status = this.status(Game.STATUS.NORMAL, betting.nextToAct, betOptions);
        return betting.nextToAct.update(status, (function(_this) {
          return function(err, res) {
            if (err) {
              _this.emit("bettingError", err, betting.nextToAct);
            }
            betting.bet(res || 0, null, err);
            return _this.takeBets(betting);
          };
        })(this));
      } else {
        this.emit("roundComplete", this.state);
        return typeof cb === "function" ? cb() : void 0;
      }
    };

    Game.prototype.takeBlinds = function() {
      return new this.Betting(this.players, this.state).takeBlinds();
    };

    Game.prototype.deal = function() {
      var retval;
      if (this.activePlayers().length <= 1 && this.state !== null) {
        return false;
      }
      retval = true;
      switch (this.state) {
        case null:
          this.preFlop();
          break;
        case 'pre-flop':
          this.flop();
          break;
        case 'flop':
          this.turn();
          break;
        case 'turn':
          this.river();
          break;
        case 'river':
        case 'final':
          this.state = 'final';
          retval = false;
      }
      this.emit('stateChange', this.state);
      return retval;
    };

    Game.prototype.preFlop = function() {
      var player, _i, _j, _len, _len1, _ref, _ref1, _results;
      this.takeBlinds();
      this.state = 'pre-flop';
      _ref = this.players;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        player = _ref[_i];
        player.cards.push(this.deck.deal());
      }
      _ref1 = this.players;
      _results = [];
      for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
        player = _ref1[_j];
        _results.push(player.cards.push(this.deck.deal()));
      }
      return _results;
    };

    Game.prototype.flop = function() {
      this.state = 'flop';
      this.burn.push(this.deck.deal());
      this.community.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
      return true;
    };

    Game.prototype.turn = function() {
      this.state = 'turn';
      this.burn.push(this.deck.deal());
      return this.community.push(this.deck.deal());
    };

    Game.prototype.river = function() {
      this.state = 'river';
      this.burn.push(this.deck.deal());
      return this.community.push(this.deck.deal());
    };

    Game.prototype.status = function(level, player, betOptions) {
      var playerLevel, s, _i, _len, _ref;
      s = {};
      s.community = this.community.map(function(c) {
        return c.toString();
      });
      s.state = this.state;
      s.hand = this.hand;
      s.betting = betOptions || null;
      if (this.winners && this.winners.length > 0) {
        s.winners = this.winners;
      }
      if (level === Game.STATUS.PRIVILEGED) {
        s.deck = this.deck;
        s.burn = this.burn;
      }
      if (player) {
        s.self = player.status(Player.STATUS.PRIVILEGED);
        s.self.position = this.players.indexOf(player);
      }
      s.players = [];
      _ref = this.players;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        player = _ref[_i];
        playerLevel = this.state === 'complete' ? Player.STATUS.FINAL : Player.STATUS.PUBLIC;
        if (level === Game.STATUS.PRIVILEGED) {
          playerLevel = Player.STATUS.PRIVILEGED;
        }
        s.players.push(player.status(playerLevel));
      }
      return s;
    };

    Game.prototype.distributeWinnings = function(winners) {
      if (winners.length > 1) {
        return this.splitPot(winners);
      } else {
        return this.payout(winners[0], this.take(winners[0].wagered));
      }
    };

    Game.prototype.splitPot = function(winners) {
      var each, i, leftover, lowest, total, winner, _i, _len, _results;
      lowest = Math.min.apply(Math, winners.map(function(w) {
        return w.wagered;
      }));
      total = this.take(lowest);
      each = Math.floor(total / winners.length);
      leftover = total - each * winners.length;
      _results = [];
      for (i = _i = 0, _len = winners.length; _i < _len; i = ++_i) {
        winner = winners[i];
        if (i === 0) {
          _results.push(this.payout(winner, each + leftover));
        } else {
          _results.push(this.payout(winner, each));
        }
      }
      return _results;
    };

    Game.prototype.take = function(amount) {
      var player, total, _i, _len, _ref;
      total = 0;
      _ref = this.players;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        player = _ref[_i];
        if (amount > player.wagered) {
          total = total + player.wagered;
          player.payout = player.payout - player.wagered;
          player.wagered = 0;
        } else {
          total = total + amount;
          player.payout = player.payout - amount;
          player.wagered = player.wagered - amount;
        }
      }
      return total;
    };

    Game.prototype.payout = function(winner, amount) {
      this.winners.push({
        position: winner.position,
        amount: amount
      });
      winner.payout = winner.payout + amount;
      return winner.chips = amount + winner.chips;
    };

    Game.prototype.pot = function() {
      var player, t, _i, _len, _ref;
      t = 0;
      _ref = this.players;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        player = _ref[_i];
        t = t + player.wagered;
      }
      return t;
    };

    Game.prototype.activePlayers = function() {
      var calls;
      calls = this.players.filter(function(p) {
        return p.inPlay();
      });
      return calls;
    };

    Game.prototype.notifyPlayers = function(callback, index) {
      var player;
      index || (index = 0);
      player = this.players[index];
      if (player) {
        return player.update(this.status(Game.STATUS.FINAL, player), (function(_this) {
          return function() {
            return _this.notifyPlayers(callback, index + 1);
          };
        })(this));
      } else {
        return callback();
      }
    };

    Game.prototype.settle = function() {
      var hands, inPlay, winners, winningHands;
      this.state = 'complete';
      inPlay = this.activePlayers();
      while (inPlay.length >= 1) {
        if (inPlay.length === 1) {
          this.distributeWinnings(inPlay);
          break;
        } else {
          hands = inPlay.map((function(_this) {
            return function(p) {
              return p.makeHand(_this.community);
            };
          })(this));
          winningHands = Hand.pickWinners(hands);
          winners = inPlay.filter(function(p) {
            return winningHands.indexOf(p.hand) >= 0;
          });
          this.distributeWinnings(winners);
          inPlay = this.activePlayers();
        }
      }
      return this.notifyPlayers((function(_this) {
        return function() {
          return _this.emit('complete');
        };
      })(this));
    };

    return Game;

  })(EventEmitter);

}).call(this);