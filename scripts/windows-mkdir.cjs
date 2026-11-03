// Build-process-only fallback for this Windows desktop sandbox's asynchronous
// EPERM directory-creation failures. The synchronous call uses identical options
// and normal OS permissions; real permission failures still propagate.
if (process.platform === "win32") {
  const fs = require("node:fs");
  const fsp = require("node:fs/promises");
  const mkdir = fs.mkdir;
  const mkdirPromise = fsp.mkdir.bind(fsp);
  fs.mkdir = function (destination, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? undefined : options;
    if (typeof cb !== "function") return mkdir.apply(this, arguments);
    return mkdir.call(this, destination, opts, (error, created) => {
      if (error?.code !== "EPERM") return cb(error, created);
      try {
        const made = fs.mkdirSync(destination, opts);
        cb(null, made);
      } catch (failure) {
        cb(failure);
      }
    });
  };
  fsp.mkdir = async function (destination, options) {
    try {
      return await mkdirPromise(destination, options);
    } catch (error) {
      if (error?.code !== "EPERM") throw error;
      return fs.mkdirSync(destination, options);
    }
  };
  require("node:module").syncBuiltinESMExports();
}
