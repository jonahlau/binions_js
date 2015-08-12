(function() {
  var NoLimit;

  NoLimit = module.exports = function(small, big) {
    var Analysis, bigBlind, smallBlind;
    smallBlind = Math.floor(small / 2);
    bigBlind = small;
    return Analysis = (function() {
      function Analysis(players, state) {
        this.state = state;
        this.players = players;
        this.nextToAct = null;
        this.canRaise = true;
        this.offset = 0;
        this.minToCall = 0;
        this.minToRaise = 0;
        if (players.length === 2 && this.state === 'pre-flop') {
          this.offset = 1;
        } else if (this.state === 'pre-flop') {
          this.offset = 2;
        }
        if (this.state === 'turn' || this.state === 'river') {
          this.roundMinimum = big;
        } else {
          this.roundMinimum = small;
        }
        this.analyze();
      }

      Analysis.prototype.gameActive = function() {
        var actives;
        actives = this.players.filter(function(pos) {
          return pos.active();
        });
        return actives.length > 1;
      };

      Analysis.prototype.actions = function() {
        var act, actions, i, j, player, _i, _j, _len, _ref, _ref1;
        actions = [];
        for (i = _i = 0, _ref = this.players.length - 1; 0 <= _ref ? _i <= _ref : _i >= _ref; i = 0 <= _ref ? ++_i : --_i) {
          i = (i + this.offset) % this.players.length;
          player = this.players[i];
          _ref1 = player.actions(this.state);
          for (j = _j = 0, _len = _ref1.length; _j < _len; j = ++_j) {
            act = _ref1[j];
            actions[j] || (actions[j] = []);
            actions[j].push({
              bet: act.bet,
              type: act.type,
              position: i
            });
          }
        }
        if (actions.length > 0) {
          actions = actions.reduce(function(a, b) {
            return a.concat(b);
          });
        }
        return actions;
      };

      Analysis.prototype.currentWager = function() {
        var wagers;
        wagers = this.players.map(function(pos) {
          return pos.wagered || 0;
        });
        return Math.max.apply(Math, wagers);
      };

      Analysis.prototype.blinds = function() {
        if (this.players.length > 2) {
          return [smallBlind, bigBlind];
        } else {
          return [bigBlind, smallBlind];
        }
      };

      Analysis.prototype.analyze = function() {
        var act, currentBet, lastPosition, minRaise, previousBet, raise, _i, _len, _ref;
        this.nextToAct = null;
        this.minToRaise = minRaise = this.roundMinimum;
        this.minToCall = this.currentWager();
        previousBet = 0;
        lastPosition = null;
        _ref = this.actions();
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          act = _ref[_i];
          currentBet = act['bet'] || 0;
          raise = currentBet - previousBet;
          if (currentBet > this.minToCall) {
            this.minToCall = currentBet;
          }
          if (raise >= minRaise) {
            minRaise = raise;
            this.lastRaisePosition = act['position'];
          }
          previousBet = currentBet;
          lastPosition = act['position'];
        }
        this.minToRaise = minRaise + this.minToCall;
        if (this.gameActive()) {
          this.setNextToAct(lastPosition);
        }
        if (this.nextToAct) {
          return this.options();
        } else {
          return false;
        }
      };

      Analysis.prototype.setNextToAct = function(lastPos) {
        var i, nextPos, player, _i, _ref;
        if (lastPos == null) {
          lastPos = this.offset - 1;
        }
        nextPos = (lastPos + 1) % this.players.length;
        for (i = _i = nextPos, _ref = nextPos + this.players.length; nextPos <= _ref ? _i <= _ref : _i >= _ref; i = nextPos <= _ref ? ++_i : --_i) {
          player = this.players[i % this.players.length];
          if (player.canBet()) {
            if (player.wagered < this.minToCall) {
              this.nextToAct = player;
              break;
            }
            if (player.actions(this.state).length === 0) {
              this.nextToAct = player;
              break;
            }
          }
        }
        if (this.lastRaisePosition && this.players[this.lastRaisePosition] === this.nextToAct) {
          return this.canRaise = false;
        }
      };

      Analysis.prototype.bet = function(amount, position, err) {
        var player, total;
        if (position === null) {
          player = this.nextToAct;
        } else {
          player = this.players[position];
        }
        amount = parseInt(amount, 10) || 0;
        total = player.wagered + amount;
        amount = Math.min(amount, player.chips);
        if (player.chips === amount) {
          player.act(this.state, 'allIn', amount);
        } else if (this.minToCall - player.wagered === 0 && total < this.minToRaise) {
          player.act(this.state, 'check', 0, err);
        } else if (total < this.minToCall) {
          player.act(this.state, 'fold', 0, err);
        } else if (total >= this.minToRaise) {
          player.act(this.state, 'raise', amount);
        } else if (total >= this.minToCall) {
          player.act(this.state, 'call', this.minToCall - player.wagered);
        }
        return this.analyze();
      };

      Analysis.prototype.takeBlinds = function() {
        var blind, i, _i, _len, _ref;
        _ref = this.blinds();
        for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
          blind = _ref[i];
          this.players[i].takeBlind(blind);
        }
        return this.analyze();
      };

      Analysis.prototype.options = function() {
        var o;
        o = {};
        o.call = this.minToCall - this.nextToAct.wagered;
        o.raise = this.minToRaise - this.nextToAct.wagered;
        o.canRaise = this.canRaise;
        return o;
      };

      return Analysis;

    })();
  };

}).call(this);
