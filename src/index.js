/* eslint-disable
  import/first,
  import/order,
  comma-dangle,
  linebreak-style,
  no-param-reassign,
  no-underscore-dangle,
  prefer-destructuring
*/
import schema from './options.json';
import loaderUtils from 'loader-utils';
import validateOptions from 'schema-utils';

import SingleEntryPlugin from 'webpack/lib/SingleEntryPlugin';
import WebWorkerTemplatePlugin from 'webpack/lib/webworker/WebWorkerTemplatePlugin';

import getWorker from './workers/';
import LoaderError from './Error';

export default function loader() {}

export function pitch(request) {
  const options = loaderUtils.getOptions(this) || {};

  validateOptions(schema, options, 'Worker Loader');

  if (!this.webpack) {
    throw new LoaderError({
      name: 'Worker Loader',
      message: 'This loader is only usable with webpack',
    });
  }

  this.cacheable(false);

  const cb = this.async();

  let nameTemplate = options.name;
  if (!nameTemplate) {
    // TODO: Ideally use a more robust env check:
    nameTemplate =
      process.env.NODE_ENV === 'production' ? '[name].[hash].worker.js' : '[name].worker.js';
  }

  const filename = loaderUtils.interpolateName(this, nameTemplate, {
    context: options.context || this.rootContext || this.options.context,
    regExp: options.regExp,
  });

  const worker = {};

  worker.options = {
    filename,
    chunkFilename: `[id].${filename}`,
    namedChunkFilename: null,
    // Force global object to be self to avoid it being "window":
    globalObject: 'self',
  };

  worker.compiler = this._compilation.createChildCompiler('worker', worker.options);

  new WebWorkerTemplatePlugin(worker.options).apply(worker.compiler);

  new SingleEntryPlugin(this.context, `!!${request}`, 'main').apply(worker.compiler);

  const subCache = `subcache ${__dirname} ${request}`;

  worker.compilation = (compilation) => {
    if (compilation.cache) {
      if (!compilation.cache[subCache]) {
        compilation.cache[subCache] = {};
      }

      compilation.cache = compilation.cache[subCache];
    }
  };

  if (worker.compiler.hooks) {
    worker.compiler.hooks.compilation.tap('sharedworker-loader', worker.compilation);
  } else {
    worker.compiler.plugin('compilation', worker.compilation);
  }

  worker.compiler.runAsChild((err, entries, compilation) => {
    if (err) return cb(err);

    if (entries[0]) {
      worker.file = entries[0].files[0];

      worker.factory = getWorker(worker.file, compilation.assets[worker.file].source(), options);

      return cb(
        null,
        `module.exports = function SharedWorkerWrapper(name) {\n  return ${worker.factory};\n};`,
      );
    }

    return cb(null, null);
  });
}
