import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../extension/lib/scheduler.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function make(delay = 20) {
  const calls = [];
  const results = [];
  const errors = [];
  const sched = new Scheduler({
    minGapMs: 0,
    translate: async (text, opts) => {
      calls.push({ text, ...opts });
      await sleep(delay);
      if (text === 'boom') throw new Error('échec');
      return `FR:${text}`;
    },
    onResult: (r) => results.push(r),
    onError: (e) => errors.push(e.message),
  });
  return { sched, calls, results, errors };
}

test('le provisoire le plus récent gagne, les intermédiaires sont abandonnés', async () => {
  const { sched, results } = make();
  sched.push({ id: 0, text: 'a', final: false });
  sched.push({ id: 0, text: 'a b', final: false });
  sched.push({ id: 0, text: 'a b c', final: false });
  await sleep(120);
  assert.deepEqual(results.map((r) => r.text), ['FR:a', 'FR:a b c']);
});

test('un final n\'est jamais abandonné, même si un énoncé plus récent arrive', async () => {
  const { sched, results } = make();
  sched.push({ id: 0, text: 'a', final: false });
  sched.push({ id: 0, text: 'a b', final: true });
  sched.push({ id: 1, text: 'c', final: false });
  await sleep(150);
  const finals = results.filter((r) => r.final);
  assert.deepEqual(finals.map((r) => r.text), ['FR:a b']);
  assert.equal(results.at(-1).id, 1);
});

test('un provisoire est ignoré si un final du même id attend déjà', async () => {
  const { sched, results } = make();
  sched.push({ id: 0, text: 'x', final: false });
  sched.push({ id: 0, text: 'x y', final: true });
  sched.push({ id: 0, text: 'x y z', final: false });
  await sleep(120);
  assert.deepEqual(results.map((r) => r.text), ['FR:x', 'FR:x y']);
});

test('même texte : une seule requête (cache)', async () => {
  const { sched, calls, results } = make(5);
  sched.push({ id: 0, text: 'same', final: false });
  await sleep(40);
  sched.push({ id: 0, text: 'same', final: true });
  await sleep(40);
  assert.equal(calls.length, 1);
  assert.equal(results.length, 2);
  assert.equal(results[1].final, true);
});

test('le contexte est le dernier énoncé final', async () => {
  const { sched, calls } = make(5);
  sched.push({ id: 0, text: 'first sentence', final: true });
  await sleep(40);
  sched.push({ id: 1, text: 'second', final: false });
  await sleep(40);
  assert.equal(calls[0].context, '');
  assert.equal(calls[1].context, 'first sentence');
});

test('une erreur est signalée et la file continue', async () => {
  const { sched, results, errors } = make(5);
  sched.push({ id: 0, text: 'boom', final: true });
  sched.push({ id: 1, text: 'ok', final: true });
  await sleep(80);
  assert.deepEqual(errors, ['échec']);
  assert.deepEqual(results.map((r) => r.text), ['FR:ok']);
});
