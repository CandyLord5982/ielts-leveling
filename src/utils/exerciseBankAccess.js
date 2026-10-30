export const NO_EXERCISE_BANK_ACCESS = Object.freeze({ mode: 'none', folder_ids: [] })

export const normalizeExerciseBankAccess = (value) => {
  if (value?.mode === 'full') return { mode: 'full', folder_ids: [] }
  if (value?.mode !== 'folders' || !Array.isArray(value.folder_ids)) {
    return NO_EXERCISE_BANK_ACCESS
  }
  const folderIds = [...new Set(value.folder_ids.filter(id => typeof id === 'string' && id))]
  return folderIds.length ? { mode: 'folders', folder_ids: folderIds } : NO_EXERCISE_BANK_ACCESS
}

// Ancestors are visible for navigation, but only granted folders and descendants
// may contribute exercises, counts, or a restored folder selection.
export const getExerciseBankFolderScope = (folders, access) => {
  const permission = normalizeExerciseBankAccess(access)
  if (permission.mode === 'full') return { folders, folderIds: null, canAccess: true }
  if (permission.mode === 'none') return { folders: [], folderIds: [], canAccess: false }

  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const children = new Map()
  for (const folder of folders) {
    const siblings = children.get(folder.parent_folder_id) || []
    siblings.push(folder.id)
    children.set(folder.parent_folder_id, siblings)
  }
  const allowed = new Set()
  const pending = permission.folder_ids.filter(id => byId.has(id))
  while (pending.length) {
    const id = pending.pop()
    if (allowed.has(id)) continue
    allowed.add(id)
    pending.push(...(children.get(id) || []))
  }

  const visible = new Set(allowed)
  for (const id of allowed) {
    let parentId = byId.get(id)?.parent_folder_id
    const visited = new Set([id])
    while (byId.has(parentId) && !visited.has(parentId)) {
      visited.add(parentId)
      visible.add(parentId)
      parentId = byId.get(parentId).parent_folder_id
    }
  }
  return {
    folders: folders.filter(folder => visible.has(folder.id)),
    folderIds: [...allowed],
    canAccess: allowed.size > 0,
  }
}
