import test from 'node:test';
import assert from 'node:assert/strict';
import { Stabilizer } from '../extension/lib/stabilizer.js';

test('retient waitK mots de queue sur un provisoire', () => {
  const s = new Stabilizer({ waitK: 2 });
  assert.deepEqual(s.interim('hello there my friend'), { id: 0, text: 'hello there', final: false });
  assert.equal(s.interim('hello there my friend'), null);
  assert.equal(s.interim('hello there my friend how').text, 'hello there my');
});

test('waitK = 0 émet tout le texte provisoire', () => {
  const s = new Stabilizer({ waitK: 0 });
  assert.equal(s.interim('hello there').text, 'hello there');
});

test('trop peu de mots : rien à traduire', () => {
  const s = new Stabilizer({ waitK: 2 });
  assert.equal(s.interim('hello'), null);
  assert.equal(s.interim(''), null);
});

test('les mots finalisés sont toujours stables', () => {
  const s = new Stabilizer({ waitK: 2 });
  assert.equal(s.commit('hello there', false).text, 'hello there');
  assert.equal(s.interim('my friend'), null); // 4 mots - 2 = 2 = déjà émis
  assert.equal(s.interim('my friend how are').text, 'hello there my friend');
});

test('fin d\'énoncé : final, puis nouvel id', () => {
  const s = new Stabilizer({ waitK: 2 });
  s.interim('how are you doing');
  const end = s.commit('how are you doing', true);
  assert.deepEqual(end, { id: 0, text: 'how are you doing', final: true });
  assert.equal(s.interim('fine thanks and you').id, 1);
});

test('fenêtre glissante : au plus maxWindow mots', () => {
  const s = new Stabilizer({ waitK: 0, maxWindow: 5 });
  const long = Array.from({ length: 12 }, (_, i) => `w${i}`).join(' ');
  assert.equal(s.interim(long).text, 'w7 w8 w9 w10 w11');
});

test('flush force la fin de l\'énoncé courant', () => {
  const s = new Stabilizer({ waitK: 2 });
  assert.equal(s.flush(), null);
  s.commit('one two three', false);
  const job = s.flush();
  assert.equal(job.final, true);
  assert.equal(job.text, 'one two three');
  assert.equal(s.flush(), null);
});

test('un énoncé vide qui se termine ne produit rien', () => {
  const s = new Stabilizer();
  assert.equal(s.commit('', true), null);
  assert.equal(s.interim('a b c').id, 1);
});
