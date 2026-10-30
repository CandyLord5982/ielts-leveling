import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getExerciseBankFolderScope,
  normalizeExerciseBankAccess,
} from '../src/utils/exerciseBankAccess.js'

const folders = [
  { id: 'root-a', name: 'Course A', parent_folder_id: null },
  { id: 'unit-a', name: 'Unit A', parent_folder_id: 'root-a' },
  { id: 'lesson-a', name: 'Lesson A', parent_folder_id: 'unit-a' },
  { id: 'practice-a', name: 'Practice', parent_folder_id: 'lesson-a' },
  { id: 'sibling-a', name: 'Other unit', parent_folder_id: 'root-a' },
  { id: 'root-b', name: 'Course B', parent_folder_id: null },
  { id: 'lesson-b', name: 'Lesson B', parent_folder_id: 'root-b' },
]

const grant = (...folderIds) => ({ mode: 'folders', folder_ids: folderIds })
const sorted = values => [...values].sort()
const visibleIds = scope => scope.folders.map(folder => folder.id)

test('missing, malformed, and unrecognized permissions deny access', () => {
  for (const value of [
    undefined, null, false, 1, 'full', [], {},
    { mode: 'none', folder_ids: ['root-a'] },
    { mode: 'admin' },
    { mode: 'FULL' },
    { mode: 'folders' },
    { mode: 'folders', folder_ids: 'root-a' },
  ]) {
    assert.deepEqual(normalizeExerciseBankAccess(value), { mode: 'none', folder_ids: [] })
  }
})

test('folder grants discard malformed IDs and duplicates without changing the response', () => {
  const input = { mode: 'folders', folder_ids: ['lesson-a', null, 42, '', 'unit-a', 'lesson-a', {}, false] }
  const before = structuredClone(input)
  assert.deepEqual(normalizeExerciseBankAccess(input), grant('lesson-a', 'unit-a'))
  assert.deepEqual(input, before)
})

test('empty or wholly malformed folder grants deny access', () => {
  for (const folderIds of [[], [null, undefined, 0, false, '', {}]]) {
    assert.deepEqual(normalizeExerciseBankAccess({ mode: 'folders', folder_ids: folderIds }), {
      mode: 'none', folder_ids: [],
    })
  }
})

test('full access includes every folder and uses an unrestricted scope for unfiled exercises', () => {
  const access = { mode: 'full', folder_ids: ['lesson-a'] }
  assert.deepEqual(normalizeExerciseBankAccess(access), { mode: 'full', folder_ids: [] })
  const scope = getExerciseBankFolderScope(folders, access)
  assert.equal(scope.canAccess, true)
  assert.equal(scope.folderIds, null)
  assert.deepEqual(scope.folders, folders)

  const emptyBank = getExerciseBankFolderScope([], { mode: 'full' })
  assert.equal(emptyBank.canAccess, true)
  assert.equal(emptyBank.folderIds, null)
})

test('denied access exposes neither folders nor a queryable folder scope', () => {
  for (const access of [undefined, { mode: 'none' }, grant()]) {
    assert.deepEqual(getExerciseBankFolderScope(folders, access), {
      folders: [], folderIds: [], canAccess: false,
    })
  }
})

test('granting a root includes its complete subtree and excludes other roots', () => {
  const scope = getExerciseBankFolderScope(folders, grant('root-a'))
  const expected = ['root-a', 'unit-a', 'lesson-a', 'practice-a', 'sibling-a']
  assert.equal(scope.canAccess, true)
  assert.deepEqual(sorted(scope.folderIds), sorted(expected))
  assert.deepEqual(sorted(visibleIds(scope)), sorted(expected))
})

test('a nested grant includes descendants while ancestors are navigation-only', () => {
  const scope = getExerciseBankFolderScope(folders, grant('unit-a'))
  assert.equal(scope.canAccess, true)
  assert.deepEqual(sorted(scope.folderIds), sorted(['unit-a', 'lesson-a', 'practice-a']))
  assert.deepEqual(sorted(visibleIds(scope)), sorted(['root-a', 'unit-a', 'lesson-a', 'practice-a']))
  assert.ok(!scope.folderIds.includes('root-a'), 'parent exercises must remain inaccessible')
  assert.ok(!visibleIds(scope).includes('sibling-a'), 'a parent path must not reveal sibling folders')
  assert.ok(!visibleIds(scope).includes('root-b'))
})

test('unknown or deleted grants fail closed instead of exposing the bank', () => {
  assert.deepEqual(getExerciseBankFolderScope(folders, grant('deleted-folder', 'unknown-folder')), {
    folders: [], folderIds: [], canAccess: false,
  })
  assert.deepEqual(getExerciseBankFolderScope([], grant('root-a')), {
    folders: [], folderIds: [], canAccess: false,
  })

  const mixed = getExerciseBankFolderScope(folders, grant('deleted-folder', 'lesson-a'))
  assert.deepEqual(sorted(mixed.folderIds), ['lesson-a', 'practice-a'])
  assert.ok(!visibleIds(mixed).includes('deleted-folder'))
})

test('multiple disjoint grants expose only their subtrees and ancestor paths', () => {
  const scope = getExerciseBankFolderScope(folders, grant('unit-a', 'lesson-b'))
  assert.deepEqual(sorted(scope.folderIds), sorted(['unit-a', 'lesson-a', 'practice-a', 'lesson-b']))
  assert.deepEqual(sorted(visibleIds(scope)), sorted(['root-a', 'unit-a', 'lesson-a', 'practice-a', 'root-b', 'lesson-b']))
  assert.ok(!scope.folderIds.includes('root-b'))
  assert.ok(!visibleIds(scope).includes('sibling-a'))
})

test('overlapping grants do not duplicate descendants or navigation folders', () => {
  const scope = getExerciseBankFolderScope(folders, grant('unit-a', 'lesson-a', 'unit-a'))
  assert.deepEqual(sorted(scope.folderIds), sorted(['unit-a', 'lesson-a', 'practice-a']))
  assert.equal(new Set(visibleIds(scope)).size, scope.folders.length)
})

test('cyclic descendant and ancestor chains terminate without granting unrelated folders', () => {
  const cyclic = [
    { id: 'x', parent_folder_id: 'y' },
    { id: 'y', parent_folder_id: 'x' },
    { id: 'leaf', parent_folder_id: 'x' },
    { id: 'unrelated', parent_folder_id: null },
  ]
  const parentGrant = getExerciseBankFolderScope(cyclic, grant('x'))
  assert.deepEqual(sorted(parentGrant.folderIds), ['leaf', 'x', 'y'])
  assert.deepEqual(sorted(visibleIds(parentGrant)), ['leaf', 'x', 'y'])

  const leafGrant = getExerciseBankFolderScope(cyclic, grant('leaf'))
  assert.deepEqual(leafGrant.folderIds, ['leaf'])
  assert.deepEqual(sorted(visibleIds(leafGrant)), ['leaf', 'x', 'y'])
})

test('scope calculation preserves the input folders and permission response', () => {
  const inputFolders = Object.freeze(folders.map(folder => Object.freeze({ ...folder })))
  const access = Object.freeze({ mode: 'folders', folder_ids: Object.freeze(['unit-a', 'lesson-b']) })
  const before = structuredClone({ folders: inputFolders, access })
  const scope = getExerciseBankFolderScope(inputFolders, access)
  assert.equal(scope.canAccess, true)
  assert.deepEqual({ folders: inputFolders, access }, before)
})
