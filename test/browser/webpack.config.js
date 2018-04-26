const path = require('path')

module.exports = {
  entry: path.resolve(__dirname, 'entry.js'),
  output: {
    path: __dirname,
    filename: 'bundle.js',
  },
  mode: 'development',
}
