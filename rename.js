const fs = require('fs');
const path = require('path');

const outdir = path.resolve(__dirname, 'dist', 'esm');

const renameMjs = (path) => fs.promises.rename(path, path.replace('.js', '.mjs'));

const main = async () => {

  // replace import
  let fp = path.join(outdir, 'binary_parser.js');
  const contents = await fs.promises.readFile(fp, { encoding: 'utf8' });
  await fs.promises.writeFile(fp, contents.replace('"./context"', '"./context.mjs"'));

  // change filenames
  renameMjs(fp);
  renameMjs(path.join(outdir, 'context.js'));
}

main()
