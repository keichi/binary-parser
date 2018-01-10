//========================================================================================
// class Context
//========================================================================================

//----------------------------------------------------------------------------------------
// constructor
//----------------------------------------------------------------------------------------

var Context = function() {
  this.code = "";
  this.scopes = [["vars"]];
  this.isAsync = false;
  this.bitFields = [];
  this.tmpVariableCount = 0;
  this.references = {};
};

//----------------------------------------------------------------------------------------
// public methods
//----------------------------------------------------------------------------------------

Context.prototype.generateVariable = function(name) {
  var arr = [];

  Array.prototype.push.apply(arr, this.scopes[this.scopes.length - 1]);
  if (name) {
    arr.push(name);
  }

  return arr.join(".");
};

Context.prototype.generateOption = function(val) {
  switch (typeof val) {
    case "number":
      return val.toString();
    case "string":
      return this.generateVariable(val);
    case "function":
      return "(" + val + ").call(" + this.generateVariable() + ", vars)";
  }
};

Context.prototype.generateError = function() {
  var args = Array.prototype.slice.call(arguments);
  var err = Context.interpolate.apply(this, args);

  if (this.isAsync) {
    this.pushCode(
      "return process.nextTick(function() { callback(new Error(" +
        err +
        "), vars); });"
    );
  } else {
    this.pushCode("throw new Error(" + err + ");");
  }
};

Context.prototype.generateTmpVariable = function() {
  return "$tmp" + this.tmpVariableCount++;
};

Context.prototype.pushCode = function() {
  var args = Array.prototype.slice.call(arguments);

  this.code += Context.interpolate.apply(this, args) + "\n";
};

Context.prototype.pushPath = function(name) {
  if (name) {
    this.scopes[this.scopes.length - 1].push(name);
  }
};

Context.prototype.popPath = function(name) {
  if (name) {
    this.scopes[this.scopes.length - 1].pop();
  }
};

Context.prototype.pushScope = function(name) {
  this.scopes.push([name]);
};

Context.prototype.popScope = function() {
  this.scopes.pop();
};

Context.prototype.addReference = function(alias) {
  if (this.references[alias]) return;
  this.references[alias] = { resolved: false, requested: false };
};

Context.prototype.markResolved = function(alias) {
  this.references[alias].resolved = true;
};

Context.prototype.markRequested = function(aliasList) {
  aliasList.forEach(
    function(alias) {
      this.references[alias].requested = true;
    }.bind(this)
  );
};

Context.prototype.getUnresolvedReferences = function() {
  var references = this.references;
  return Object.keys(this.references).filter(function(alias) {
    return !references[alias].resolved && !references[alias].requested;
  });
};

//----------------------------------------------------------------------------------------
// private methods
//----------------------------------------------------------------------------------------

Context.interpolate = function(s) {
  var re = /{\d+}/g;
  var matches = s.match(re);
  var params = Array.prototype.slice.call(arguments, 1);

  if (matches) {
    matches.forEach(function(match) {
      var index = parseInt(match.substr(1, match.length - 2), 10);
      s = s.replace(match, params[index].toString());
    });
  }

  return s;
};

exports.Context = Context;
