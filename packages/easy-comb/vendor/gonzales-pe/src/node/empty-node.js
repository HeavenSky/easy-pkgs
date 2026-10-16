'use strict';

var Node = require('./basic-node');
var NodeTypes = require('./node-types');

module.exports = function(syntax) {
  return new Node({
    type: NodeTypes.StylesheetType,
    content: [],
    syntax: syntax,
    start: [0, 0],
    end: [0, 0]
  });
};
