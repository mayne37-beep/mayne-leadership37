import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, keyboardShortcut,
  normalizeShortcuts, shortcutAction, shortcutLabel, validShortcut } from '../../src/mayne-studio/shortcuts.js';
import { makeProject, normalizeProject } from '../../src/mayne-studio/model.js';

test('default production actions include Take, Cut, overlays, scenes and both PowerPoint buses', () => {
  assert.equal(DEFAULT_SHORTCUTS.take, 'Space');
  assert.equal(DEFAULT_SHORTCUTS.cut, 'KeyC');
  assert.equal(DEFAULT_SHORTCUTS.programNext, 'PageDown');
  assert.equal(DEFAULT_SHORTCUTS.programPrevious, 'PageUp');
  assert.equal(DEFAULT_SHORTCUTS.previewNext, 'Period');
  assert.equal(DEFAULT_SHORTCUTS.overlay0, 'KeyQ');
  assert.equal(DEFAULT_SHORTCUTS.scene0, 'Digit1');
  assert.equal(new Set(Object.values(DEFAULT_SHORTCUTS)).size, SHORTCUT_ACTIONS.length);
});
test('shortcuts persist with projects and older projects adopt safe defaults', () => {
  const project = makeProject();
  assert.deepEqual(normalizeProject(project), project);
  project.shortcuts.programNext = 'Ctrl+Alt+KeyN';
  project.shortcuts.overlay0 = 'Shift+F5';
  assert.equal(normalizeProject(project).shortcuts.programNext, 'Ctrl+Alt+KeyN');
  assert.equal(normalizeProject(project).shortcuts.overlay0, 'Shift+F5');
  delete project.shortcuts;
  assert.deepEqual(normalizeProject(project).shortcuts, DEFAULT_SHORTCUTS);
});
test('event matching honors modifiers and distinguishes different keys', () => {
  assert.equal(keyboardShortcut({ code: 'KeyN',ctrlKey:true,altKey:true,shiftKey:false,metaKey:false }), 'Ctrl+Alt+KeyN');
  assert.equal(keyboardShortcut({ code: 'PageDown',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false }), 'PageDown');
  assert.equal(keyboardShortcut({ code: 'Tab',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false }), '');
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS, 'Space'), 'take');
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS, 'PageDown'), 'programNext');
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS, 'KeyX'), '');
  assert.equal(shortcutLabel('Ctrl+Alt+KeyN'), 'Ctrl + Alt + N');
  assert.ok(validShortcut('Shift+F5'));
  assert.equal(validShortcut('Enter'), false);
});
test('invalid, duplicate, and unknown saved shortcuts are dropped or cleared', () => {
  const next = normalizeShortcuts({ take: 'KeyZ', overlay0: 'KeyZ', foo: 'KeyN', cut: 'Enter' });
  assert.equal(next.take, 'KeyZ');
  assert.equal(next.overlay0, '');
  assert.equal(next.cut, 'KeyC');
  assert.equal(next.foo, undefined);
});
