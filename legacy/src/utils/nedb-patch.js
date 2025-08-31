// Patch for NeDB to fix deprecated util.isDate
const util = require('util');

// Add the missing isDate function that was deprecated in newer Node versions
if (!util.isDate) {
  util.isDate = function (obj) {
    return obj instanceof Date;
  };
}

// Also add other deprecated functions if needed
if (!util.isArray) {
  util.isArray = Array.isArray;
}

if (!util.isRegExp) {
  util.isRegExp = function (obj) {
    return obj instanceof RegExp;
  };
}

if (!util.isError) {
  util.isError = function (obj) {
    return obj instanceof Error;
  };
}

module.exports = util;
