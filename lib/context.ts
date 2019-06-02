
export class Context {
  code = "";
  scopes = [["vars"]];
  isAsync = false;
  bitFields = [];
  tmpVariableCount = 0;
  references = {};
  
  generateVariable(name?) {
    var arr = [];
  
    Array.prototype.push.apply(arr, this.scopes[this.scopes.length - 1]);
    if (name) {
      arr.push(name);
    }
  
    return arr.join(".");
  }

  generateOption(val) {
    switch (typeof val) {
      case "number":
        return val.toString();
      case "string":
        return this.generateVariable(val);
      case "function":
        return "(" + val + ").call(" + this.generateVariable() + ", vars)";
    }
  };
  
  generateError(...args) {
    var err = this.interpolate.apply(this, args);
  
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
  
  generateTmpVariable() {
    return "$tmp" + this.tmpVariableCount++;
  };
  
  pushCode(...code) {
    var args = code;
  
    this.code += this.interpolate.apply(this, args) + "\n";
  };
  
  pushPath(name) {
    if (name) {
      this.scopes[this.scopes.length - 1].push(name);
    }
  };
  
  popPath(name) {
    if (name) {
      this.scopes[this.scopes.length - 1].pop();
    }
  };
  
  pushScope(name) {
    this.scopes.push([name]);
  };
  
  popScope() {
    this.scopes.pop();
  };
  
  addReference(alias) {
    if (this.references[alias]) return;
    this.references[alias] = { resolved: false, requested: false };
  };
  
  markResolved(alias) {
    this.references[alias].resolved = true;
  };
  
  markRequested(aliasList) {
    aliasList.forEach(
      function(alias) {
        this.references[alias].requested = true;
      }.bind(this)
    );
  };
  
  getUnresolvedReferences() {
    var references = this.references;
    return Object.keys(this.references).filter(function(alias) {
      return !references[alias].resolved && !references[alias].requested;
    });
  };

  interpolate(s) {
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
}

