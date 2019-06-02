export class Context {
  code = '';
  scopes = [['vars']];
  isAsync = false;
  bitFields = [];
  tmpVariableCount = 0;
  references: { [key: string]: { resolved: boolean; requested: boolean } } = {};

  generateVariable(name?: string) {
    var arr = [];

    const scopes = this.scopes[this.scopes.length - 1];
    arr.push(...scopes);
    if (name) {
      arr.push(name);
    }

    return arr.join('.');
  }

  generateOption(val: number | string | Function) {
    switch (typeof val) {
      case 'number':
        return val.toString();
      case 'string':
        return this.generateVariable(val);
      case 'function':
        return '(' + val + ').call(' + this.generateVariable() + ', vars)';
    }
  }

  generateError(template: string, ...args: string[]) {
    var err = this.interpolate(template, args);

    if (this.isAsync) {
      this.pushCode(
        'return process.nextTick(function() { callback(new Error(' +
          err +
          '), vars); });'
      );
    } else {
      this.pushCode('throw new Error(' + err + ');');
    }
  }

  generateTmpVariable() {
    return '$tmp' + this.tmpVariableCount++;
  }

  pushCode(template: string, ...args: (string | Function | number)[]) {
    this.code += this.interpolate(template, ...args) + '\n';
  }

  pushPath(name: string) {
    if (name) {
      this.scopes[this.scopes.length - 1].push(name);
    }
  }

  popPath(name: string) {
    if (name) {
      this.scopes[this.scopes.length - 1].pop();
    }
  }

  pushScope(name: string) {
    this.scopes.push([name]);
  }

  popScope() {
    this.scopes.pop();
  }

  addReference(alias: string) {
    if (this.references[alias]) return;
    this.references[alias] = { resolved: false, requested: false };
  }

  markResolved(alias: string) {
    this.references[alias].resolved = true;
  }

  markRequested(aliasList: string[]) {
    aliasList.forEach(alias => {
      this.references[alias].requested = true;
    });
  }

  getUnresolvedReferences() {
    var references = this.references;
    return Object.keys(this.references).filter(alias => {
      return !references[alias].resolved && !references[alias].requested;
    });
  }

  interpolate(template: string, ...args: any[]) {
    var re = /{\d+}/g;
    var matches = template.match(re);

    if (matches) {
      matches.forEach(match => {
        var index = parseInt(match.substr(1, match.length - 2), 10);
        template = template.replace(match, args[index].toString());
      });
    }

    return template;
  }
}
