const path = require('path')

module.exports = {
  mode: 'production',
  entry: './src/pandora-bundle.js',
  output: {
    filename: 'pandora-admin-bundle.min.js',
    path: path.resolve(__dirname, 'js'),
    library: {
      type: 'window'
    }
  },
  resolve: {
    extensions: ['.js', '.json', '.ts'],
    fallback: {
      "crypto": false,
      "stream": false,
      "assert": false,
      "http": false,
      "https": false,
      "os": false,
      "url": false,
      "buffer": false,
      "process": false
    }
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false
        }
      }
    ]
  },
  optimization: {
    minimize: true
  }
}