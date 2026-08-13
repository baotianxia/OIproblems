import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { getScrollPos, setScrollPos } from './scrollCache'
import { Typography, Space, Spin, Empty, Button, Modal, Input, message, Dropdown, Checkbox, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { FolderOutlined, OrderedListOutlined, EditOutlined, CopyOutlined, ThunderboltOutlined, SelectOutlined, DeleteOutlined, CheckSquareOutlined, ArrowUpOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons'
import { renderMarkdown, submitOnEnter, handleLinkPaste } from '../utils'
import { AutoFocusInput } from './AutoFocusInput'
import { useAppContext } from '../context/AppContext'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import MoveModal from './MoveModal'
import SortableRow from './SortableRow'

interface Props {
  folderId: number
}

export default function FolderContent({ folderId }: Props): JSX.Element {
  const [subFolders, setSubFolders] = useState<FolderItem[]>([])
  const [sheets, setSheets] = useState<SheetItem[]>([])
  const [folderName, setFolderName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set())
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<number>>(new Set())
  const { selectNode, refreshTree, isDark, bumpDataVersion, contentReloadSignal } = useAppContext()
  const [moveTarget, setMoveTarget] = useState<{ type: 'folder' | 'sheet'; id: number; name: string; parentId?: number | null } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleFolderDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = subFolders.findIndex(f => f.id === active.id)
    const newIndex = subFolders.findIndex(f => f.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    if (oldIndex === newIndex) return
    setSubFolders(prev => {
      const next = arrayMove(prev, oldIndex, newIndex)
      window.api.folder.reorder({ items: next.map((f, i) => ({ id: f.id, sortOrder: i })) })
      return next
    })
    refreshTree()
  }, [subFolders, refreshTree])

  const handleSheetDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sheets.findIndex(s => s.id === active.id)
    const newIndex = sheets.findIndex(s => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    if (oldIndex === newIndex) return
    setSheets(prev => {
      const next = arrayMove(prev, oldIndex, newIndex)
      window.api.sheet.reorder({ items: next.map((s, i) => ({ id: s.id, sortOrder: i })) })
      return next
    })
    refreshTree()
  }, [sheets, refreshTree])

  const handleMoveConfirm = async (parentId: number | null) => {
    const target = moveTarget
    if (!target) return { success: false, error: '未选择目标' }
    if (parentId === target.parentId) return { success: false, error: '目标与当前位置相同' }
    const result = target.type === 'folder'
      ? await window.api.folder.move({ id: target.id, parentId })
      : await window.api.sheet.move({ id: target.id, folderId: parentId })
    if (result.success) {
      await refreshTree()
      await loadData()
    }
    return result
  }

  const applySort = async (type: 'folder' | 'sheet', mode: 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc' | 'create' | 'manual') => {
    const dir = (mode === 'name-asc' || mode === 'time-asc') ? 1 : -1
    const comparator = (a: FolderItem | SheetItem, b: FolderItem | SheetItem): number => {
      if (mode === 'manual') {
        const d = a.drag_order - b.drag_order
        if (d !== 0) return d
        return a.id - b.id
      }
      if (mode === 'create') return a.id - b.id
      if (mode === 'name-asc' || mode === 'name-desc') {
        return a.name.localeCompare(b.name, 'zh-Hans-CN') * dir
      }
      return (a.created_at || '').localeCompare(b.created_at || '') * dir
    }
    const items = (input: { id: number }[]) => input.map((x, i) => ({ id: x.id, sortOrder: i }))
    if (type === 'folder') {
      const sorted = [...subFolders].sort(comparator as (a: FolderItem, b: FolderItem) => number)
      const unchanged = sorted.map(x => x.id).join(',') === subFolders.map(x => x.id).join(',')
      if (unchanged) {
        message.info(mode === 'manual' ? '当前已是拖拽顺序' : mode === 'create' ? '当前已是创建顺序' : '当前已按此顺序排列')
        return
      }
      setSubFolders(sorted)
      const payload = items(sorted)
      if (mode === 'manual') {
        await window.api.folder.reorder({ items: payload })
      } else {
        await window.api.folder.sort({ items: payload })
      }
    } else {
      const sorted = [...sheets].sort(comparator as (a: SheetItem, b: SheetItem) => number)
      const unchanged = sorted.map(x => x.id).join(',') === sheets.map(x => x.id).join(',')
      if (unchanged) {
        message.info(mode === 'manual' ? '当前已是拖拽顺序' : mode === 'create' ? '当前已是创建顺序' : '当前已按此顺序排列')
        return
      }
      setSheets(sorted)
      const payload = items(sorted)
      if (mode === 'manual') {
        await window.api.sheet.reorder({ items: payload })
      } else {
        await window.api.sheet.sort({ items: payload })
      }
    }
    refreshTree()
  }

  const handleRandomProblem = async () => {
    const result = await window.api.problem.randomFromContext({ folderId })
    if (!result) {
      message.info('没有未完成的题目')
      return
    }
    selectNode({ id: result.sheet_id, type: 'sheet', name: result.name, highlightProblemId: result.id })
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.tree.get()
      const folder = data.folders.find(f => f.id === folderId)
      if (folder) {
        setFolderName(folder.name)
        setDescription(folder.description || '')
      }

      const children = data.folders.filter(f => f.parent_id === folderId)
      setSubFolders(children)

      const sheetList = data.sheets.filter(s => s.folder_id === folderId)
      setSheets(sheetList)

      const s = await window.api.stats.folder({ id: folderId })
      setStats(s)
    } finally {
      setLoading(false)
    }
  }, [folderId])

  useEffect(() => {
    loadData()
  }, [loadData, contentReloadSignal])

  useEffect(() => {
    setSelectMode(false)
    setSelectedFolderIds(new Set())
    setSelectedSheetIds(new Set())
  }, [folderId])

  const scrollPosRef = useRef(0)
  useLayoutEffect(() => {
    const el = document.getElementById('scroll-container')
    if (!el) return
    scrollPosRef.current = el.scrollTop
    const onScroll = () => { scrollPosRef.current = el.scrollTop }
    el.addEventListener('scroll', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      const key = `scrollPos_folder_${folderId}`
      const finalPos = scrollPosRef.current
      setScrollPos(key, finalPos)
      window.api.ui.set(key, String(finalPos))
    }
  }, [folderId])

  const scrollRestored = useRef(false)
  useEffect(() => { scrollRestored.current = false }, [folderId])
  useLayoutEffect(() => {
    let cancelled = false
    if (loading || !folderName || scrollRestored.current) return
    scrollRestored.current = true
    const el = document.getElementById('scroll-container')
    if (!el) return
    const key = `scrollPos_folder_${folderId}`
    const cached = getScrollPos(key)
    if (cached !== undefined && cached > 0) {
      el.scrollTop = cached
    } else {
      el.scrollTop = 0
      window.api.ui.get(key).then(saved => {
        if (cancelled) return
        const pos = saved ? parseInt(saved, 10) : 0
        setScrollPos(key, pos)
        if (pos > 0) el.scrollTop = pos
      })
    }
    return () => { cancelled = true }
  }, [loading, folderName, folderId])

  const handleEditDescription = () => {
    let val = description
    Modal.confirm({
      title: '编辑目录描述',
      autoFocusButton: null,
      content: (
        <Input.TextArea
          defaultValue={description}
          rows={3}
          onChange={e => { val = e.target.value }}
          onPaste={handleLinkPaste}
        />
      ),
      onOk: async () => {
        await window.api.folder.updateDescription({ id: folderId, description: val })
        setDescription(val)
        message.success('描述已更新')
      }
    })
  }

  const handleCopyDescription = async () => {
    if (!description) return
    await navigator.clipboard.writeText(description)
    message.success('描述已复制到剪贴板')
  }

  const createFolder = () => {
    let name = ''
    Modal.confirm({
      title: '新建子文件夹',
      autoFocusButton: null,
      content: (
        <AutoFocusInput
          placeholder="输入文件夹名称"
          onChange={e => { name = e.target.value }}
          onKeyDown={submitOnEnter}
        />
      ),
      onOk: async () => {
        if (!name.trim()) return
        await window.api.folder.create({ name: name.trim(), parentId: folderId })
        message.success('文件夹已创建')
        bumpDataVersion()
        await refreshTree()
        await loadData()
      }
    })
  }

  const createSheet = () => {
    let name = ''
    Modal.confirm({
      title: '新建题单',
      autoFocusButton: null,
      content: (
        <AutoFocusInput
          placeholder="输入题单名称"
          onChange={e => { name = e.target.value }}
          onKeyDown={submitOnEnter}
        />
      ),
      onOk: async () => {
        if (!name.trim()) return
        await window.api.sheet.create({ name: name.trim(), folderId })
        message.success('题单已创建')
        bumpDataVersion()
        await refreshTree()
        await loadData()
      }
    })
  }

  const renameFolder = (id: number, currentName: string) => {
    let newName = ''
    Modal.confirm({
      title: '重命名文件夹',
      autoFocusButton: null,
      content: (
        <AutoFocusInput defaultValue={currentName} placeholder="输入新名称" onChange={e => { newName = e.target.value }} onKeyDown={submitOnEnter} />
      ),
      onOk: async () => {
        if (!newName.trim()) return
        await window.api.folder.rename({ id, name: newName.trim() })
        loadData()
        refreshTree()
        message.success('已重命名')
      }
    })
  }

  const deleteFolder = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确认继续？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.api.folder.delete({ id })
        await refreshTree()
        await loadData()
        message.success('已删除')
      }
    })
  }

  const renameSheet = (id: number, currentName: string) => {
    let newName = ''
    Modal.confirm({
      title: '重命题单',
      autoFocusButton: null,
      content: (
        <AutoFocusInput defaultValue={currentName} placeholder="输入新名称" onChange={e => { newName = e.target.value }} onKeyDown={submitOnEnter} />
      ),
      onOk: async () => {
        if (!newName.trim()) return
        await window.api.sheet.rename({ id, name: newName.trim() })
        loadData()
        refreshTree()
        message.success('已重命名')
      }
    })
  }

  const deleteSheet = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后无法恢复，确认继续？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        await window.api.sheet.delete({ id })
        await refreshTree()
        await loadData()
        message.success('已删除')
      }
    })
  }

  const handleBatchDelete = async () => {
    const total = selectedFolderIds.size + selectedSheetIds.size
    if (total === 0) { message.info('未选择任何内容'); return }
    Modal.confirm({
      title: '确认批量删除',
      content: `将删除 ${selectedFolderIds.size} 个文件夹和 ${selectedSheetIds.size} 个题单，不可恢复。`,
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        if (selectedFolderIds.size > 0) {
          await window.api.folder.batchDelete({ ids: [...selectedFolderIds] })
        }
        if (selectedSheetIds.size > 0) {
          await window.api.sheet.batchDelete({ ids: [...selectedSheetIds] })
        }
        message.success('已删除')
        setSelectMode(false)
        setSelectedFolderIds(new Set())
        setSelectedSheetIds(new Set())
        bumpDataVersion()
        await refreshTree()
        await loadData()
      }
    })
  }

  if (loading) return <Spin style={{ display: 'block', marginTop: 100 }} />

  const renderStats = () => {
    if (!stats) return null
    const rate = stats.totalProblems > 0
      ? Math.round((stats.completedProblems / stats.totalProblems) * 100) : 0
    return (
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        全部 {stats.completedProblems}/{stats.totalProblems} ({rate}%)
      </Typography.Text>
    )
  }

  const renderDescription = () => {
    if (!description) return null
    return (
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Typography.Text style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{renderMarkdown(description, isDark)}</Typography.Text>
        <Space size={2}>
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyDescription} />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={handleEditDescription} />
        </Space>
      </div>
    )
  }

  const sortOptions: { key: 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc' | 'create' | 'manual'; label: string }[] = [
    { key: 'name-asc', label: '按名称 A-Z' },
    { key: 'name-desc', label: '按名称 Z-A' },
    { key: 'time-asc', label: '按创建时间 旧→新' },
    { key: 'time-desc', label: '按创建时间 新→旧' },
  ]
  const pageSortChildren = (type: 'folder' | 'sheet'): MenuProps['items'] => {
    const items: MenuProps['items'] = sortOptions.map(o => ({ key: o.key, label: o.label, onClick: () => applySort(type, o.key) }))
    items.push({ type: 'divider' })
    items.push({ key: 'create', label: '按创建顺序', onClick: () => applySort(type, 'create') })
    items.push({ key: 'manual', label: '恢复拖拽顺序', onClick: () => applySort(type, 'manual') })
    return items
  }

  const pageMenuItems: MenuProps['items'] = [
    { key: 'new-folder', icon: <PlusOutlined />, label: '新建子文件夹', onClick: createFolder },
    { key: 'new-sheet', icon: <OrderedListOutlined />, label: '新建题单', onClick: createSheet },
    { type: 'divider' },
    { key: 'sort-folders', icon: <FolderOutlined />, label: '排序子文件夹区域', children: pageSortChildren('folder') },
    { key: 'sort-sheets', icon: <OrderedListOutlined />, label: '排序题单区域', children: pageSortChildren('sheet') },
  ]

  return (
    <Dropdown menu={{ items: pageMenuItems }} trigger={['contextMenu']}>
      <div style={{ minHeight: '100%' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, float: 'right', marginTop: 4 }}>
        <Button size="small" icon={<SelectOutlined />} type={selectMode ? 'primary' : 'default'} onClick={() => { setSelectMode(v => !v); setSelectedFolderIds(new Set()); setSelectedSheetIds(new Set()) }}>选择</Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <FolderOutlined /> {folderName}
        </Typography.Title>
        <Space>
          <Button size="small" icon={<ThunderboltOutlined />} onClick={handleRandomProblem}>随机跳题</Button>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={handleEditDescription}>编辑描述</Button>
        </Space>
      </div>
      {renderDescription()}
      {renderStats()}

      {subFolders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>子文件夹</Typography.Text>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFolderDragEnd}>
            <SortableContext items={subFolders.map(f => f.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {subFolders.map(f => {
                  const sortMenu: MenuProps['items'] = [
                    { key: 'name-asc', label: '按名称 A-Z' },
                    { key: 'name-desc', label: '按名称 Z-A' },
                    { key: 'time-asc', label: '按创建时间 旧→新' },
                    { key: 'time-desc', label: '按创建时间 新→旧' },
                    { type: 'divider' },
                    { key: 'create', label: '按创建顺序' },
                    { key: 'manual', label: '恢复拖拽顺序' },
                  ]
                  const folderMenuItems: MenuProps['items'] = [
                    { key: 'rename', label: '重命名', onClick: () => renameFolder(f.id, f.name) },
                    { key: 'move', label: '移动到...', icon: <ArrowUpOutlined />, onClick: () => setMoveTarget({ type: 'folder', id: f.id, name: f.name, parentId: f.parent_id }) },
                    { key: 'delete', label: '删除', danger: true, onClick: () => deleteFolder(f.id) },
                    { type: 'divider' },
                    {
                      key: 'sort', label: '排序当前区域',
                      children: sortMenu.map(item => ({
                        ...item,
                        onClick: () => applySort('folder', item.key as 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc' | 'create' | 'manual')
                      }))
                    },
                  ]
                  return (
                    <Dropdown key={f.id} menu={{ items: folderMenuItems }} trigger={['contextMenu']}>
                      <div onContextMenu={e => e.stopPropagation()}>
                        <SortableRow
                          id={f.id}
                          disabled={selectMode}
                          isDark={isDark}
                          checked={selectedFolderIds.has(f.id)}
                          onCheckChange={v => setSelectedFolderIds(prev => { const n = new Set(prev); v ? n.add(f.id) : n.delete(f.id); return n })}
                          onClick={() => { if (!selectMode) selectNode({ id: f.id, type: 'folder', name: f.name }) }}
                          actions={
                            <>
                              <Tooltip title="重命名">
                                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => renameFolder(f.id, f.name)} />
                              </Tooltip>
                              <Tooltip title="移动到...">
                                <Button type="text" size="small" icon={<ArrowUpOutlined />} onClick={() => setMoveTarget({ type: 'folder', id: f.id, name: f.name, parentId: f.parent_id })} />
                              </Tooltip>
                              <Tooltip title="删除">
                                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteFolder(f.id)} />
                              </Tooltip>
                            </>
                          }
                        >
                          <FolderOutlined /> {f.name}
                        </SortableRow>
                      </div>
                    </Dropdown>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {sheets.length > 0 && (
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>题单</Typography.Text>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSheetDragEnd}>
            <SortableContext items={sheets.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sheets.map(s => {
                  const sortMenu: MenuProps['items'] = [
                    { key: 'name-asc', label: '按名称 A-Z' },
                    { key: 'name-desc', label: '按名称 Z-A' },
                    { key: 'time-asc', label: '按创建时间 旧→新' },
                    { key: 'time-desc', label: '按创建时间 新→旧' },
                    { type: 'divider' },
                    { key: 'create', label: '按创建顺序' },
                    { key: 'manual', label: '恢复拖拽顺序' },
                  ]
                  const sheetMenuItems: MenuProps['items'] = [
                    { key: 'rename', label: '重命名', onClick: () => renameSheet(s.id, s.name) },
                    { key: 'move', label: '移动到...', icon: <ArrowUpOutlined />, onClick: () => setMoveTarget({ type: 'sheet', id: s.id, name: s.name, parentId: s.folder_id }) },
                    { key: 'delete', label: '删除', danger: true, onClick: () => deleteSheet(s.id) },
                    { type: 'divider' },
                    {
                      key: 'sort', label: '排序当前区域',
                      children: sortMenu.map(item => ({
                        ...item,
                        onClick: () => applySort('sheet', item.key as 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc' | 'create' | 'manual')
                      }))
                    },
                  ]
                  return (
                    <Dropdown key={s.id} menu={{ items: sheetMenuItems }} trigger={['contextMenu']}>
                      <div onContextMenu={e => e.stopPropagation()}>
                        <SortableRow
                          id={s.id}
                          disabled={selectMode}
                          isDark={isDark}
                          checked={selectedSheetIds.has(s.id)}
                          onCheckChange={v => setSelectedSheetIds(prev => { const n = new Set(prev); v ? n.add(s.id) : n.delete(s.id); return n })}
                          onClick={() => { if (!selectMode) selectNode({ id: s.id, type: 'sheet', name: s.name }) }}
                          actions={
                            <>
                              <Tooltip title="重命名">
                                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => renameSheet(s.id, s.name)} />
                              </Tooltip>
                              <Tooltip title="移动到...">
                                <Button type="text" size="small" icon={<ArrowUpOutlined />} onClick={() => setMoveTarget({ type: 'sheet', id: s.id, name: s.name, parentId: s.folder_id })} />
                              </Tooltip>
                              <Tooltip title="删除">
                                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteSheet(s.id)} />
                              </Tooltip>
                            </>
                          }
                        >
                          <OrderedListOutlined /> {s.name}
                        </SortableRow>
                      </div>
                    </Dropdown>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {subFolders.length === 0 && sheets.length === 0 && (
        <Empty description="空文件夹" style={{ marginTop: 60 }} />
      )}

      {selectMode && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 10, background: isDark ? '#1f1f1f' : '#fff', borderTop: `1px solid ${isDark ? '#333' : '#d9d9d9'}`, padding: '8px 16px', marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <Space>
            <Button size="small" icon={<CheckSquareOutlined />} onClick={() => { subFolders.forEach(f => setSelectedFolderIds(prev => new Set(prev).add(f.id))); sheets.forEach(s => setSelectedSheetIds(prev => new Set(prev).add(s.id))) }}>全选</Button>
            <Button size="small" onClick={() => { setSelectedFolderIds(new Set()); setSelectedSheetIds(new Set()) }}>取消选择</Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>删除</Button>
          </Space>
        </div>
      )}
      <MoveModal
        visible={!!moveTarget}
        type={moveTarget?.type ?? 'folder'}
        itemName={moveTarget?.name ?? ''}
        excludeId={moveTarget?.type === 'folder' ? moveTarget.id : undefined}
        onClose={() => setMoveTarget(null)}
        onConfirm={handleMoveConfirm}
      />
      </div>
    </Dropdown>
  )
}
