const assert = require('assert');
const {tokenize, computeTfIdf, cosineSimilarity, buildGraph} = require('../script.js');

function testTfIdf() {
  const docs = [
    {name: 'a.txt', text: 'hello world'},
    {name: 'b.txt', text: 'hello there world'}
  ];
  computeTfIdf(docs);
  assert(docs[0].vector.hasOwnProperty('hello'));
  const sim = cosineSimilarity(docs[0].vector, docs[1].vector);
  assert(Number.isFinite(sim));
}

function testBuildGraph() {
  const docs = [
    {name: 'doc1', text: 'text one', categories: ['x'], summary: 's1'},
    {name: 'doc2', text: 'text two', categories: ['x','y'], summary: 's2'}
  ];
  const graph = buildGraph(docs);
  assert(graph.nodes.length >= 4);
  assert(graph.links.length >= 2);
}

testTfIdf();
testBuildGraph();
console.log('All tests passed.');

