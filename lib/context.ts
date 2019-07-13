import { Parser } from './binary_parser';

export class Context {
  code = '';
  scopes = [['vars']];
  bitFields: Parser[] = [];
  tmpVariableCount = 0;
  references: { [key: string]: { resolved: boolean; requested: boolean } } = {};

  generateVariable(name?: string) {
    const arr = [];

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
        return `(${val}).call(${this.generateVariable()}, vars)`;
    }
  }

  generateError(err: string) {
    this.pushCode('throw new Error(' + err + ');');
  }

  generateTmpVariable() {
    return '$tmp' + this.tmpVariableCount++;
  }

  pushCode(code: string) {
    this.code += code + '\n';
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
    const references = this.references;
    return Object.keys(this.references).filter(
      alias => !references[alias].resolved && !references[alias].requested
    );
  }
}
